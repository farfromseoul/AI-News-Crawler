import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { decodeCursor, querySchema, queryScope } from '../../packages/domain';
import { NewsRepository } from '../../packages/storage';

export interface ApiEnv {
  DB: D1Database;
  ASSETS: Fetcher;
}
export const app = new Hono<{ Bindings: ApiEnv }>();
app.use('/api/*', secureHeaders());
app.get('/api/health', async (c) => {
  await c.env.DB.prepare('SELECT 1').first();
  return c.json({ status: 'ok' });
});
app.get('/api/items', async (c) => {
  const parsed = querySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: 'invalid_query' }, 400);
  try {
    if (parsed.data.cursor) {
      const cursor = decodeCursor(parsed.data.cursor);
      if (
        cursor.scope !== queryScope(parsed.data) ||
        (parsed.data.sort === 'popular' && cursor.rank === undefined)
      )
        return c.json({ error: 'invalid_cursor' }, 400);
    }
  } catch {
    return c.json({ error: 'invalid_cursor' }, 400);
  }
  const result = await new NewsRepository(c.env.DB).list(parsed.data);
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(result);
});
app.get('/api/stats', async (c) => {
  const parsed = querySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: 'invalid_query' }, 400);
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(await new NewsRepository(c.env.DB).stats(parsed.data));
});
app.get('/api/items/:id', async (c) => {
  const item = await new NewsRepository(c.env.DB).get(c.req.param('id'));
  return item ? c.json(item) : c.json({ error: 'not_found' }, 404);
});
app.get('/api/sources/status', async (c) => {
  c.header('Cache-Control', 'no-store');
  return c.json({ sources: await new NewsRepository(c.env.DB).status() });
});
app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));
app.onError((_, c) => {
  console.error(JSON.stringify({ event: 'api_error', path: c.req.path }));
  return c.json({ error: 'service_unavailable' }, 503);
});
export default app;
