import { beforeAll, afterAll, it, expect } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { readFile, readdir } from 'node:fs/promises';
import { EngagementRepository } from '../packages/storage/engagement';
import { app } from '../workers/api';
let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;
let db: D1Database;
beforeAll(async () => {
  proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: 'wrangler.collector.jsonc', persist: false });
  db = proxy.env.DB;
  const files = (await readdir('migrations')).filter(f => f.endsWith('.sql')).sort();
  const sql = (await Promise.all(files.map(f => readFile('migrations/' + f, 'utf8')))).join('\n');
  await db.batch(sql.split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
  await db.prepare("INSERT INTO items(id,source,external_id,title,url,canonical_url,collected_at,sort_at) VALUES('test','geeknews','test','AI test','https://example.com','https://example.com','2026-10-17','2026-10-17')").run();
});
afterAll(async () => { await proxy?.dispose(); });
it('D1 keeps concurrent likes idempotent and distinct visit windows correct', async () => {
  const repo = new EngagementRepository(db);
  await Promise.all(Array.from({ length: 8 }, () => repo.like('test', 'visitor-a', true)));
  expect(await repo.states(['test'], 'visitor-a')).toEqual([{ id: 'test', count: 1, liked: true }]);
  expect((await repo.like('test', 'visitor-a', false))?.count).toBe(0);
  const now = Date.parse('2026-10-17T15:00:00Z');
  await repo.visit('visitor-a', now); await repo.visit('visitor-a', now); await repo.visit('visitor-a', now - 86400000);
  expect(await repo.stats(now)).toMatchObject({ today: 1, visitors30d: 1, day: '2026-10-18' });
});
it('Worker with local D1 issues functional cookie without analytics visit', async () => {
  const env = { DB: db, ASSETS: {} as Fetcher, ENGAGEMENT_ENABLED: 'true', ENGAGEMENT_ORIGIN: 'https://signal.example', ENGAGEMENT_LIMITER: { limit: async () => ({ success: true }) } };
  const headers = { Origin: env.ENGAGEMENT_ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' };
  const r = await app.request('/api/engagement/items/test/like', { method: 'PUT', headers, body: '{}' }, env);
  expect(r.status).toBe(200); expect(r.headers.get('set-cookie')).toContain('HttpOnly');
  expect(r.headers.get('cache-control')).toBe('private, no-store');
  expect(await r.json()).toMatchObject({ liked: true, count: 1 });
  const before = await db.prepare('SELECT COUNT(*) n FROM engagement_daily_visitors').first<{ n: number }>();
  const denied = await app.request('/api/engagement/visit', { method: 'POST', headers, body: JSON.stringify({ consent: false, version: 1 }) }, env);
  expect(denied.status).toBe(400);
  expect(await db.prepare('SELECT COUNT(*) n FROM engagement_daily_visitors').first()).toEqual(before);
});
