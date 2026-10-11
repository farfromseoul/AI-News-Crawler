import { engineeringFeeds, conferences } from '../../packages/domain/catalog';
import { RssAdapter, type FeedSource } from '../../packages/sources/rss';
import { normalize, sources, type Source, type NewsItem } from '../../packages/domain';
import {
  GeekNewsAdapter,
  HackerNewsAdapter,
  YouTubeSearchAdapter,
  youtubeQueries,
  XAdapter,
  SourceError,
  type SourceAdapter,
} from '../../packages/sources';
import { NewsRepository } from '../../packages/storage';
import { defaultXQuery } from '../../packages/sources/x';

export interface CollectorEnv {
  DB: D1Database;
  CONFERENCE_SEARCH?: boolean;
  YOUTUBE_API_KEY?: string;
  YOUTUBE_QUERIES?: string;
  YOUTUBE_DAILY_SEARCH_LIMIT?: string;
  X_BEARER_TOKEN?: string;
  X_QUERY?: string;
  X_DAILY_LIMIT?: string;
  X_MONTHLY_LIMIT?: string;
  X_OFFICIAL_AUTHOR_IDS?: string;
}
function positive(value: string | undefined) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}
async function reserveX(db: D1Database, env: CollectorEnv, now: string): Promise<number> {
  const day = now.slice(0, 10),
    month = now.slice(0, 7);
  // Caller holds the source lease. Reserve before the external call; failures are not refunded.
  const daily = await db
    .prepare('SELECT reserved FROM usage_budget WHERE source=? AND period=?')
    .bind('x', day)
    .first<{ reserved: number }>();
  const monthly = await db
    .prepare('SELECT reserved FROM usage_budget WHERE source=? AND period=?')
    .bind('x', month)
    .first<{ reserved: number }>();
  const amount = Math.min(
    100,
    positive(env.X_DAILY_LIMIT) - (daily?.reserved ?? 0),
    positive(env.X_MONTHLY_LIMIT) - (monthly?.reserved ?? 0),
  );
  if (amount < 10) return 0;
  await db.batch(
    [day, month].map((period) =>
      db
        .prepare(
          'INSERT INTO usage_budget(source,period,reserved) VALUES(?,?,?) ON CONFLICT(source,period) DO UPDATE SET reserved=reserved+excluded.reserved',
        )
        .bind('x', period, amount),
    ),
  );
  return amount;
}
export async function collectSource(env: CollectorEnv, source: Source, override?: SourceAdapter) {
  const now = new Date().toISOString(),
    runId = crypto.randomUUID();
  const lock = await env.DB.prepare(
    `UPDATE source_state SET lock_until=?,lock_owner=? WHERE source=? AND (lock_until IS NULL OR lock_until < ?)`,
  )
    .bind(new Date(Date.now() + 600000).toISOString(), runId, source, now)
    .run();
  if (!lock.meta.changes) return { source, status: 'locked' };
  let started = false;
  try {
    let adapter: SourceAdapter | undefined = override,
      maxItems = 250;
    if (!adapter) {
      if (source in engineeringFeeds) adapter = new RssAdapter(source as FeedSource);
      if (source === 'geeknews') adapter = new GeekNewsAdapter();
      if (source === 'hackernews') adapter = new HackerNewsAdapter();
      if (source === 'youtube' && env.YOUTUBE_API_KEY) {
        const queries = youtubeQueries(env.YOUTUBE_QUERIES),
          calls = queries.length * 2;
        if (!calls) throw new SourceError('invalid_queries');
        const day = now.slice(0, 10);
        const used = await env.DB.prepare(
          'SELECT reserved FROM usage_budget WHERE source=? AND period=?',
        )
          .bind('youtube', day)
          .first<{ reserved: number }>();
        const limit =
          env.YOUTUBE_DAILY_SEARCH_LIMIT === undefined
            ? 16
            : positive(env.YOUTUBE_DAILY_SEARCH_LIMIT);
        if ((used?.reserved ?? 0) + calls > limit) {
          await env.DB.prepare(
            "UPDATE source_state SET status='budget_exhausted',last_attempt_at=? WHERE source=?",
          )
            .bind(now, source)
            .run();
          return { source, status: 'budget_exhausted' };
        }
        await env.DB.prepare(
          'INSERT INTO usage_budget(source,period,reserved) VALUES(?,?,?) ON CONFLICT(source,period) DO UPDATE SET reserved=reserved+excluded.reserved',
        )
          .bind('youtube', day, calls)
          .run();
        adapter = new YouTubeSearchAdapter(
          env.YOUTUBE_API_KEY,
          queries,
          env.CONFERENCE_SEARCH ? 180 : undefined,
        );
      }
      if (
        source === 'x' &&
        env.X_BEARER_TOKEN &&
        positive(env.X_DAILY_LIMIT) >= 10 &&
        positive(env.X_MONTHLY_LIMIT) >= 10
      ) {
        maxItems = await reserveX(env.DB, env, now);
        if (!maxItems) {
          await env.DB.prepare(
            "UPDATE source_state SET status='budget_exhausted',last_attempt_at=? WHERE source=?",
          )
            .bind(now, source)
            .run();
          return { source, status: 'budget_exhausted' };
        }
        adapter = new XAdapter(
          env.X_BEARER_TOKEN,
          env.X_QUERY?.trim() || defaultXQuery,
          (env.X_OFFICIAL_AUTHOR_IDS ?? '')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean),
        );
      }
    }
    if (!adapter) {
      await env.DB.prepare(
        "UPDATE source_state SET status='not_configured',last_attempt_at=?,error_code=NULL WHERE source=?",
      )
        .bind(now, source)
        .run();
      return { source, status: 'not_configured' };
    }
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO ingestion_runs(id,source,started_at,status) VALUES(?,?,?,?)',
      ).bind(runId, source, now, 'running'),
      env.DB.prepare('UPDATE source_state SET last_attempt_at=? WHERE source=?').bind(now, source),
    ]);
    started = true;
    const previous = await env.DB.prepare('SELECT last_success_at FROM source_state WHERE source=?')
      .bind(source)
      .first<{ last_success_at: string | null }>();
    const earliest = Date.now() - (source in engineeringFeeds ? 90 : 6.9) * 86400000;
    const since = new Date(
      Math.max(
        earliest,
        previous?.last_success_at ? Date.parse(previous.last_success_at) - 48 * 3600000 : earliest,
      ),
    ).toISOString();
    const result = await adapter.fetch({ since, maxItems });
    const items = result.items.map((i) => normalize(i, now)).filter((i): i is NewsItem => !!i);
    const stored = await new NewsRepository(env.DB).upsert(items);
    const status = result.complete ? 'ok' : 'partial';
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE source_state SET status=?,last_success_at=?,error_code=NULL WHERE source=?',
      ).bind(status, now, source),
      env.DB.prepare(
        'UPDATE ingestion_runs SET finished_at=?,status=?,fetched=?,stored=? WHERE id=?',
      ).bind(new Date().toISOString(), status, result.items.length, stored, runId),
    ]);
    console.log(JSON.stringify({ runId, source, status, fetched: result.items.length, stored }));
    return { source, status, fetched: result.items.length, stored };
  } catch (error) {
    const code = error instanceof SourceError ? error.code : 'processing_error';
    await env.DB.prepare(
      "UPDATE source_state SET status='error',last_attempt_at=?,error_code=? WHERE source=?",
    )
      .bind(now, code, source)
      .run();
    if (started)
      await env.DB.prepare(
        "UPDATE ingestion_runs SET status='error',finished_at=?,error_code=? WHERE id=?",
      )
        .bind(new Date().toISOString(), code, runId)
        .run();
    console.error(JSON.stringify({ runId, source, error: code }));
    return { source, status: 'error', error: code };
  } finally {
    await env.DB.prepare(
      'UPDATE source_state SET lock_until=NULL,lock_owner=NULL WHERE source=? AND lock_owner=?',
    )
      .bind(source, runId)
      .run();
  }
}
export async function collectAll(env: CollectorEnv) {
  const results = [];
  for (const source of sources) results.push(await collectSource(env, source));
  return results;
}
export default {
  async scheduled(event: ScheduledController, env: CollectorEnv) {
    // Separate invocations keep RSS parsing and external requests out of the original 49-call batch.
    if (event.cron === '0-7 6 * * *') {
      const source = (Object.keys(engineeringFeeds) as FeedSource[])[
        new Date(event.scheduledTime).getUTCMinutes()
      ];
      if (source) await collectSource(env, source);
    } else if (event.cron === '30 6 * * *') {
      const entries = Object.values(conferences);
      const start = (Math.floor(event.scheduledTime / 86400000) * 4) % entries.length;
      const queries = Array.from(
        { length: 4 },
        (_, i) => entries[(start + i) % entries.length].query,
      );
      await collectSource(
        { ...env, CONFERENCE_SEARCH: true, YOUTUBE_QUERIES: queries.join('|') },
        'youtube',
      );
    } else {
      for (const source of ['geeknews', 'x', 'youtube', 'hackernews'] as const)
        await collectSource(env, source);
    }
  },
  fetch() {
    return new Response('Not found', { status: 404 });
  },
};
