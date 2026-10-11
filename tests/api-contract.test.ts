import { describe, it, expect, vi } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import { app } from '../workers/api';

describe('OpenAPI contract', () => {
  it('serves a valid specification without database or assets access', async () => {
    const response = await app.request('/openapi.json');
    expect(response.status).toBe(200);
    const spec = (await response.json()) as any;
    await SwaggerParser.validate(structuredClone(spec));
    expect(spec.openapi).toBe('3.1.0');
    expect(Object.keys(spec.paths)).toHaveLength(5);
    expect(spec.servers).toEqual([{ url: '/', description: '현재 서버' }]);
    const operations = Object.values(spec.paths).map((path: any) => path.get.operationId);
    expect(new Set(operations).size).toBe(5);
    const params = spec.paths['/api/items'].get.parameters;
    expect(params.find((p: any) => p.name === 'limit').schema.maximum).toBe(50);
    expect(params.find((p: any) => p.name === 'source').schema.enum).toHaveLength(12);
  });
  it('serves Swagger before the API wildcard, with pinned assets', async () => {
    const response = await app.request('/api/docs');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const html = await response.text();
    expect(html).toContain('/openapi.json');
    expect(html).toContain('5.30.3');
  });
  it.each([
    'source=unknown',
    'limit=51',
    'period=30d',
    'sort=popular',
    'kind=tutorial',
    'source=youtube&kind=official',
    'cursor=bad',
  ])('preserves invalid request errors: %s', async (query) => {
    const r = await app.request('/api/items?' + query);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({
      error: query === 'cursor=bad' ? 'invalid_cursor' : 'invalid_query',
    });
  });
  it('keeps database failure private', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await app.request('/api/health', {}, {
        DB: {
          prepare() {
            throw Error('private-secret');
          },
        },
      } as any);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'service_unavailable' });
      expect(JSON.stringify(log.mock.calls)).not.toContain('private-secret');
    } finally {
      log.mockRestore();
    }
  });
});
