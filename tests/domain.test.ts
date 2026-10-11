import { describe, expect, it } from 'vitest';
import {
  canonicalUrl,
  normalize,
  querySchema,
  RuleBasedEnricher,
  decodeCursor,
  encodeCursor,
} from '../packages/domain';
import { parseGeekNews, SourceError, request } from '../packages/sources';
import { vi } from 'vitest';

describe('normalization and relevance', () => {
  it('does not mistake substring matches for AI', () => {
    const enricher = new RuleBasedEnricher();
    expect(
      enricher.enrich({
        source: 'geeknews',
        externalId: '1',
        title: 'Daily email delivery improvements',
        url: 'https://example.com',
      }),
    ).toBeNull();
    expect(
      enricher.enrich({
        source: 'geeknews',
        externalId: '2',
        title: '새로운 AI 에이전트 개발 도구',
        url: 'https://example.com',
      })?.tags,
    ).toContain('dev');
  });
  it('normalizes dates, strips HTML, rejects unsafe URLs, preserves meaningful query parameters', () => {
    const item = normalize({
      source: 'geeknews',
      externalId: '9',
      title: '<b>AI</b> &amp; 개발',
      excerpt: '<script>alert(1)</script><p>새 도구</p>',
      url: 'https://news.hada.io/topic?id=9&utm_source=rss#test',
      publishedAt: '2026-10-10T09:00:00+09:00',
    });
    expect(item?.title).toBe('AI & 개발');
    expect(item?.excerpt).toBe('새 도구');
    expect(item?.canonicalUrl).toBe('https://news.hada.io/topic?id=9');
    expect(item?.publishedAt).toBe('2026-10-10T00:00:00.000Z');
    expect(
      normalize({ source: 'x', externalId: '2', title: 'AI', url: 'javascript:alert(1)' }),
    ).toBeNull();
    expect(canonicalUrl('https://youtube.com/watch?v=123&utm_medium=x')).toBe(
      'https://youtube.com/watch?v=123',
    );
  });
  it('uses collection time when publication time is missing', () => {
    const item = normalize(
      { source: 'x', externalId: '1', title: 'AI research', url: 'https://x.com/i/status/1' },
      '2026-10-10T00:00:00.000Z',
    )!;
    expect(item.publishedAt).toBeNull();
    expect(decodeCursor(encodeCursor(item))).toEqual({ at: item.sortAt, id: item.id });
    expect(() => decodeCursor('invalid')).toThrow();
    expect(querySchema.safeParse({ limit: '10000' }).success).toBe(false);
  });
});
describe('Atom adapter', () => {
  it('parses namespaced Atom, CDATA, author and single entry', () => {
    const items = parseGeekNews(
      `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>https://news.hada.io/topic?id=1</id><title><![CDATA[AI & 개발]]></title><link rel="alternate" href="https://news.hada.io/topic?id=1"/><published>2026-10-10T09:00:00+09:00</published><author><name>neo</name></author><content type="html"><![CDATA[<p>LLM 도구</p>]]></content></entry></feed>`,
    );
    expect(items).toHaveLength(1);
    expect(items[0].externalId).toBe('1');
    expect(items[0].excerpt).toBe('<p>LLM 도구</p>');
    expect(() =>
      parseGeekNews('<!DOCTYPE feed [<!ENTITY x SYSTEM "file:///etc/passwd">]><feed/>'),
    ).toThrow(SourceError);
    expect(() => parseGeekNews('<broken')).toThrow(SourceError);
  });
  it('bounds retries and does not retry authentication failures', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(request('https://example.com')).rejects.toMatchObject({ code: 'auth_error' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('respects long Retry-After without hammering the source', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '60' } }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(request('https://example.com')).rejects.toMatchObject({ code: 'rate_limited' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
