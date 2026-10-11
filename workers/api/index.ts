import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { routes, documentConfig } from './openapi';
import { secureHeaders } from 'hono/secure-headers';
import { decodeCursor, querySchema, queryScope } from '../../packages/domain';
import { NewsRepository } from '../../packages/storage';

export interface ApiEnv {
  DB: D1Database;
  ASSETS: Fetcher;
}
export const app = new OpenAPIHono<{ Bindings: ApiEnv }>({
  defaultHook: (result, c) => {
    if (!result.success) return c.json({ error: 'invalid_query' }, 400);
  },
});
app.use('/api/*', secureHeaders());
app.openapi(routes.health, async (c) => {
  await c.env.DB.prepare('SELECT 1').first();
  return c.json({ status: 'ok' }, 200);
});
app.openapi(routes.items, async (c) => {
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
  return c.json(result, 200);
});
app.openapi(routes.stats, async (c) => {
  const parsed = querySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: 'invalid_query' }, 400);
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(await new NewsRepository(c.env.DB).stats(parsed.data), 200);
});
app.openapi(routes.item, async (c) => {
  const item = await new NewsRepository(c.env.DB).get(c.req.param('id'));
  return item ? c.json(item, 200) : c.json({ error: 'not_found' }, 404);
});
app.openapi(routes.status, async (c) => {
  c.header('Cache-Control', 'no-store');
  return c.json({ sources: await new NewsRepository(c.env.DB).status() }, 200);
});
app.doc31('/openapi.json', documentConfig);
app.get(
  '/api/docs',
  swaggerUI({
    url: '/openapi.json',
    version: '5.30.3',
    title: 'AI SIGNAL API',
    validatorUrl: '',
    supportedSubmitMethods: ['get'],
    persistAuthorization: false,
  }),
);
app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));
app.onError((_, c) => {
  console.error(JSON.stringify({ event: 'api_error', path: c.req.path }));
  return c.json({ error: 'service_unavailable' }, 503);
});
export default app;
