import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { readFile, readdir } from 'node:fs/promises';
import { NewsRepository } from '../packages/storage';
import { normalize, querySchema } from '../packages/domain';
import { app } from '../workers/api';
import { collectSource, type CollectorEnv } from '../workers/collector';

let proxy: Awaited<ReturnType<typeof getPlatformProxy<CollectorEnv>>>;
let db: D1Database;
beforeAll(async () => {
  proxy = await getPlatformProxy<CollectorEnv>({
    configPath: 'wrangler.collector.jsonc',
    persist: false,
  });
  db = proxy.env.DB;
  for (const file of (await readdir('migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = await readFile(`migrations/${file}`, 'utf8');
    await db.batch(
      sql
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => db.prepare(s)),
    );
  }
});
afterAll(async () => {
  await proxy?.dispose();
});
describe('real local D1 pipeline', () => {
  it('upserts idempotently and pages equal timestamps without duplicates', async () => {
    const repo = new NewsRepository(db),
      at = '2026-10-10T00:00:00.000Z';
    const items = ['a', 'b', 'c'].map((id) =>
      normalize(
        {
          source: 'geeknews',
          externalId: id,
          title: `AI 도구 ${id}`,
          url: `https://news.hada.io/topic?id=${id}`,
          publishedAt: at,
        },
        at,
      )!,
    );
    await repo.upsert(items);
    await repo.upsert(items);
    const first = await repo.list(querySchema.parse({ limit: 2 }));
    expect(first.total).toBe(3);
    expect(first.items.map((i) => i.externalId)).toEqual(['c', 'b']);
    const second = await repo.list(querySchema.parse({ limit: 2, cursor: first.nextCursor }));
    expect(second.items.map((i) => i.externalId)).toEqual(['a']);
    expect(second.nextCursor).toBeNull();
    expect((await repo.list(querySchema.parse({ q: '%' }))).total).toBe(0);
    const korean = querySchema.parse({ q: '도구', limit: 2 });
    const koreanPage = await repo.list(korean);
    expect((await repo.list({ ...korean, cursor: koreanPage.nextCursor! })).items).toHaveLength(1);
    expect((await repo.list(querySchema.parse({ tag: 'dev' }))).total).toBe(3);
  });
  it('isolates failures, reports missing credentials, and releases source locks', async () => {
    const failing = await collectSource({ DB: db }, 'youtube', {
      source: 'youtube',
      async fetch() {
        throw new Error('secret must not leak');
      },
    });
    expect(failing.status).toBe('error');
    const ok = await collectSource({ DB: db }, 'geeknews', {
      source: 'geeknews',
      async fetch() {
        return { items: [], complete: true };
      },
    });
    expect(ok.status).toBe('ok');
    expect((await collectSource({ DB: db }, 'x')).status).toBe('not_configured');
    const state = await db
      .prepare("SELECT lock_owner FROM source_state WHERE source='youtube'")
      .first<{ lock_owner: string | null }>();
    expect(state?.lock_owner).toBeNull();
  });
  it('reserves X reads before a request and stops at the daily cap', async () => {
    const env = {
      DB: db,
      X_BEARER_TOKEN: 'test',
      X_QUERY: 'AI',
      X_DAILY_LIMIT: '10',
      X_MONTHLY_LIMIT: '20',
    };
    const { vi } = await import('vitest');
    const mock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [], meta: {} }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', mock);
    try {
      expect((await collectSource(env, 'x')).status).toBe('ok');
      expect((await collectSource(env, 'x')).status).toBe('budget_exhausted');
      expect(mock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('validates query parameters and returns JSON 404 instead of SPA fallback', async () => {
    const env = {
      DB: db,
      ASSETS: { fetch: async () => new Response('assets') } as unknown as Fetcher,
    };
    expect((await app.request('/api/items?cursor=broken', {}, env)).status).toBe(400);
    expect((await app.request('/api/items?source=unknown', {}, env)).status).toBe(400);
    const feed = await app.request('/api/items?limit=2', {}, env);
    expect(feed.status).toBe(200);
    expect(((await feed.json()) as { items: unknown[] }).items).toHaveLength(2);
    expect((await app.request('/api/missing', {}, env)).status).toBe(404);
    const status = await app.request('/api/sources/status', {}, env);
    expect(await status.text()).not.toContain('secret');
  });
  it('persists metrics, limits channel dominance and paginates popularity without mixing scopes', async () => {
    const repo = new NewsRepository(db),
      now = new Date().toISOString();
    const videos = [100, 90, 80, 70, 60].map((views, n) =>
      normalize(
        {
          source: 'youtube',
          externalId: `v${n}`,
          title: n === 0 ? 'AI tutorial' : 'AI release',
          url: `https://youtube.com/watch?v=v${n}`,
          authorId: n < 4 ? 'UC1' : 'UC2',
          publishedAt: now,
          metrics: { viewCount: views },
          metricsAt: now,
          discovery: ['popular:AI'],
        },
        now,
      )!,
    );
    await repo.upsert(videos);
    const query = querySchema.parse({ source: 'youtube', sort: 'popular', limit: 2 });
    const first = await repo.list(query);
    expect(first.total).toBe(4);
    expect(first.items.map((i) => i.externalId)).toEqual(['v0', 'v1']);
    const second = await repo.list({ ...query, cursor: first.nextCursor! });
    expect(second.items.map((i) => i.externalId)).toEqual(['v2', 'v4']);
    expect(second.nextCursor).toBeNull();
    expect((await repo.get('youtube:v3'))?.metrics?.viewCount).toBe(70);
    expect(
      (await repo.list(querySchema.parse({ source: 'youtube', kind: 'tutorial' }))).items[0]
        .externalId,
    ).toBe('v0');
    videos[0].metrics!.viewCount = 200;
    await repo.upsert([videos[0]]);
    expect((await repo.get('youtube:v0'))?.metrics?.viewCount).toBe(200);
    const env = { DB: db, ASSETS: {} as Fetcher };
    expect(
      (
        await app.request(
          `/api/items?source=youtube&cursor=${encodeURIComponent(first.nextCursor!)}`,
          {},
          env,
        )
      ).status,
    ).toBe(400);
    expect((await app.request('/api/items?sort=popular', {}, env)).status).toBe(400);
  });
  it('allows YouTube with only a key and persists the search budget across runs', async () => {
    const { vi } = await import('vitest');
    const fetch = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify({ items: [] })));
    vi.stubGlobal('fetch', fetch);
    try {
      const env = { DB: db, YOUTUBE_API_KEY: 'test-key', YOUTUBE_DAILY_SEARCH_LIMIT: '8' };
      expect((await collectSource(env, 'youtube')).status).toBe('ok');
      expect(fetch).toHaveBeenCalledTimes(8);
      expect((await collectSource(env, 'youtube')).status).toBe('budget_exhausted');
      expect(fetch).toHaveBeenCalledTimes(8);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('does not label unknown X accounts official and stores public metrics separately from AI relevance', async () => {
    const repo = new NewsRepository(db),
      now = new Date().toISOString();
    await repo.upsert([
      normalize(
        {
          source: 'x',
          externalId: 'official',
          title: 'AI launch',
          url: 'https://x.com/i/status/official',
          publishedAt: now,
          officialSource: true,
          metrics: { likeCount: 40, replyCount: 2 },
        },
        now,
      )!,
      normalize(
        {
          source: 'x',
          externalId: 'other',
          title: 'AI comments',
          url: 'https://x.com/i/status/other',
          publishedAt: now,
          metrics: { likeCount: 80 },
        },
        now,
      )!,
    ]);
    const popular = await repo.list(querySchema.parse({ source: 'x', sort: 'popular' }));
    expect(popular.items[0].externalId).toBe('other');
    const official = await repo.list(querySchema.parse({ source: 'x', kind: 'official' }));
    expect(official.items.map((i) => i.externalId)).toEqual(['official']);
    expect(official.items[0].score).toBe(90);
  });
});

it('persists Hacker News separately and preserves existing sources after migration', async () => {
  const repo = new NewsRepository(db);
  const item = normalize({
    source: 'hackernews',
    externalId: '100',
    title: 'AI open source agent',
    url: 'https://news.ycombinator.com/item?id=100',
    metrics: { points: 25, commentCount: 4 },
  })!;
  await repo.upsert([item]);
  expect(
    (await repo.list(querySchema.parse({ source: 'hackernews' }))).items[0].metrics?.points,
  ).toBe(25);
  expect((await repo.list(querySchema.parse({ source: 'geeknews' }))).total).toBeGreaterThan(0);
});
