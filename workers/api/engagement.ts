import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { EngagementRepository } from '../../packages/storage/engagement';
import { hash, randomToken, kstDay } from '../../packages/engagement/model';
export interface EngagementEnv {
  DB: D1Database;
  ENGAGEMENT_ENABLED?: string;
  ENGAGEMENT_ORIGIN?: string;
  ENGAGEMENT_LIMITER?: { limit(input: { key: string }): Promise<{ success: boolean }> };
}
const json = (schema: z.ZodType, description: string) => ({ description, content: { 'application/json': { schema } } });
const error = json(z.object({ error: z.string() }), '요청 거부 또는 서비스 오류');
const errors = { 400: error, 403: error, 404: error, 429: error, 503: error };
const id = z.string().min(1).max(160);
const state = z.object({ id, count: z.number().int().nonnegative(), liked: z.boolean() });
const body = (schema: z.ZodType) => ({ required: true, content: { 'application/json': { schema } } });
export const engagementApi = new OpenAPIHono<{ Bindings: EngagementEnv; Variables: { visitor: string | null; cookieName: string; secure: boolean } }>({ defaultHook: (r, c) => { if (!r.success) return c.json({ error: 'invalid_input' }, 400); } });
engagementApi.use('*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store');
  if (c.env.ENGAGEMENT_ENABLED !== 'true') return c.json({ error: 'engagement_disabled' }, 503);
  let origin: URL;
  try { origin = new URL(c.env.ENGAGEMENT_ORIGIN ?? ''); } catch { return c.json({ error: 'engagement_not_configured' }, 503); }
  const local = ['localhost', '127.0.0.1'].includes(origin.hostname);
  if (origin.origin !== c.env.ENGAGEMENT_ORIGIN || (origin.protocol !== 'https:' && !local)) return c.json({ error: 'engagement_not_configured' }, 503);
  if (c.req.method !== 'GET') {
    if (c.req.header('Origin') !== origin.origin || c.req.header('Sec-Fetch-Site') === 'cross-site') return c.json({ error: 'origin_denied' }, 403);
    if (!c.req.header('Content-Type')?.toLowerCase().startsWith('application/json')) return c.json({ error: 'json_required' }, 400);
    // Limit bytes before Hono/Zod parses. Do not trust Content-Length alone.
    const reader = c.req.raw.clone().body?.getReader();
    let bytes = 0;
    if (reader) {
      while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 12_000) { void reader.cancel(); return c.json({ error: 'body_too_large' }, 400); } }
    }
  }
  // Fail closed until the user installs the rate-limit binding. No silent bypass in production.
  if (!c.env.ENGAGEMENT_LIMITER) return c.json({ error: 'limiter_not_configured' }, 503);
  const ip = c.req.header('CF-Connecting-IP') ?? (local ? 'local' : null);
  if (!ip) return c.json({ error: 'client_unavailable' }, 403);
  const limit = await c.env.ENGAGEMENT_LIMITER.limit({ key: await hash(`${kstDay()}:${ip}`) });
  if (!limit.success) { c.header('Retry-After', '60'); return c.json({ error: 'rate_limited' }, 429); }
  c.set('secure', origin.protocol === 'https:');
  const cookieName = origin.protocol === 'https:' ? '__Host-ai-signal-visitor' : 'ai-signal-visitor';
  c.set('cookieName', cookieName);
  const token = getCookie(c, cookieName);
  let visitor: string | null = null;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const digest = await hash(token);
    if (await new EngagementRepository(c.env.DB).validVisitor(digest, Date.now())) visitor = digest;
  }
  c.set('visitor', visitor);
  await next();
});
async function ensureVisitor(c: Context<{ Bindings: EngagementEnv; Variables: { visitor: string | null; cookieName: string; secure: boolean } }>) {
  // Kept independent of any login or analytics consent; likes remain available on rejection.
  const existing = c.get('visitor') as string | null;
  if (existing) return existing;
  const token = randomToken(), digest = await hash(token);
  await new EngagementRepository(c.env.DB).createVisitor(digest, Date.now());
  setCookie(c, c.get('cookieName'), token, { httpOnly: true, secure: c.get('secure'), sameSite: 'Lax', path: '/', maxAge: 180 * 86400 });
  c.set('visitor', digest);
  return digest;
}
engagementApi.openapi(createRoute({ method: 'post', path: '/identity', operationId: 'prepareVisitorIdentity', tags: ['방문·좋아요'], summary: '기능 쿠키 준비·브라우저 저장 확인', request: { body: body(z.object({}).strict()) }, responses: { 200: json(z.object({ recognized: z.boolean() }), '쿠키 확인'), ...errors } }), async c => {
  const recognized = !!c.get('visitor');
  if (!recognized) await ensureVisitor(c);
  return c.json({ recognized }, 200);
});
engagementApi.openapi(createRoute({ method: 'post', path: '/visit', operationId: 'recordVisit', tags: ['방문·좋아요'], summary: '분석 동의 후 당일 방문 등록', request: { body: body(z.object({ consent: z.literal(true), version: z.literal(1) }).strict()) }, responses: { 200: json(z.object({ day: z.string() }), '등록'), ...errors } }), async c => {
  const visitor = await ensureVisitor(c);
  return c.json(await new EngagementRepository(c.env.DB).visit(visitor), 200);
});
engagementApi.openapi(createRoute({ method: 'get', path: '/stats', operationId: 'getVisitorStats', tags: ['방문·좋아요'], summary: '동의한 브라우저 방문 집계', responses: { 200: json(z.object({ today: z.number(), visitors30d: z.number(), day: z.string(), timezone: z.literal('Asia/Seoul'), asOf: z.string(), trackingStartedAt: z.string().nullable() }), '집계'), ...errors } }), async c => {
  // Browser cache only, not shared with any personal response. Day is in the cache key in the UI.
  c.header('Cache-Control', 'public, max-age=30');
  return c.json(await new EngagementRepository(c.env.DB).stats(), 200);
});
engagementApi.openapi(createRoute({ method: 'post', path: '/items/state', operationId: 'getItemReactions', tags: ['방문·좋아요'], summary: '최대 50개 기사 좋아요 상태', request: { body: body(z.object({ ids: z.array(id).max(50) }).strict()) }, responses: { 200: json(z.object({ items: z.array(state) }), '상태'), ...errors } }), async c => {
  const input = c.req.valid('json') as { ids: string[] };
  return c.json({ items: await new EngagementRepository(c.env.DB).states([...new Set(input.ids)], c.get('visitor')) }, 200);
});
for (const method of ['put', 'delete'] as const) {
  engagementApi.openapi(createRoute({ method, path: '/items/{id}/like', operationId: method === 'put' ? 'likeItem' : 'unlikeItem', tags: ['방문·좋아요'], summary: method === 'put' ? '기사 좋아요' : '기사 좋아요 취소', request: { params: z.object({ id }), body: body(z.object({}).strict()) }, responses: { 200: json(state.extend({ changed: z.boolean() }), '저장 상태'), ...errors } }), async c => {
    const itemId = c.req.valid('param').id;
    if (!await c.env.DB.prepare('SELECT id FROM items WHERE id=?').bind(itemId).first()) return c.json({ error: 'not_found' }, 404);
    const visitor = await ensureVisitor(c);
    const result = await new EngagementRepository(c.env.DB).like(itemId, visitor, method === 'put');
    return result ? c.json(result, 200) : c.json({ error: 'not_found' }, 404);
  });
}
