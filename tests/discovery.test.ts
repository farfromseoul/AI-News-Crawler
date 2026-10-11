import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  YouTubeSearchAdapter,
  youtubeQueries,
  durationSeconds,
} from '../packages/sources/youtube-search';
import { XAdapter } from '../packages/sources/x';
import { normalize, querySchema } from '../packages/domain';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
describe('YouTube topic discovery', () => {
  it('searches without channel IDs, merges discovery paths, fetches metrics and duration', async () => {
    const urls: URL[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const u = new URL(input);
        urls.push(u);
        if (u.pathname.endsWith('/search'))
          return json({
            items: [{ id: { videoId: 'v1' } }, { id: { videoId: 'v2' } }],
            nextPageToken: 'more',
          });
        return json({
          items: [
            {
              id: 'v1',
              snippet: {
                title: 'AI coding tutorial',
                description: 'AI agents',
                channelId: 'UC1',
                channelTitle: 'Creator',
                publishedAt: new Date().toISOString(),
                liveBroadcastContent: 'none',
              },
              statistics: { viewCount: '1500', likeCount: '30' },
              contentDetails: { duration: 'PT1H2M3S' },
            },
            {
              id: 'v2',
              snippet: {
                title: 'AI news',
                channelId: 'UC2',
                channelTitle: 'Other',
                publishedAt: new Date().toISOString(),
              },
              statistics: {},
            },
          ],
        });
      }),
    );
    const result = await new YouTubeSearchAdapter('key', ['AI coding']).fetch({
      since: new Date().toISOString(),
      maxItems: 50,
    });
    expect(urls).toHaveLength(3);
    expect(urls.slice(0, 2).map((u) => u.searchParams.get('order'))).toEqual(['date', 'viewCount']);
    expect(urls.every((u) => !u.searchParams.has('channelId'))).toBe(true);
    expect(urls[2].searchParams.get('id')).toBe('v1,v2');
    expect(
      Date.parse(urls[0].searchParams.get('publishedAfter')!) -
        Date.parse(urls[1].searchParams.get('publishedAfter')!),
    ).toBe(5 * 86400000);
    expect(result.items).toHaveLength(2);
    expect(result.complete).toBe(false);
    expect(result.items[0].metrics?.viewCount).toBe(1500);
    expect(result.items[0].durationSeconds).toBe(3723);
    expect(result.items[0].discovery).toHaveLength(2);
    expect(result.items[1].metrics?.viewCount).toBeUndefined();
    expect(normalize(result.items[0])?.contentKind).toBe('tutorial');
  });
  it('caps queries, interleaves capped candidates and omits removed/live videos', async () => {
    expect(youtubeQueries(' a | a | b | c | d | e ')).toEqual(['a', 'b', 'c', 'd']);
    const searches: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const u = new URL(input);
        if (u.pathname.endsWith('/search')) {
          searches.push(u.searchParams.get('order')!);
          return json({
            items: [
              { id: { videoId: searches.length === 1 ? 'fresh' : 'popular' } },
              { id: { videoId: 'same' } },
            ],
          });
        }
        expect(u.searchParams.get('id')).toBe('fresh,popular');
        return json({
          items: [
            {
              id: 'fresh',
              snippet: {
                title: 'AI live',
                channelId: 'UC1',
                channelTitle: 'One',
                publishedAt: new Date().toISOString(),
                liveBroadcastContent: 'live',
              },
            },
          ],
        });
      }),
    );
    const result = await new YouTubeSearchAdapter('key', ['AI']).fetch({
      since: '2026-01-01',
      maxItems: 2,
    });
    expect(result.items).toEqual([]);
    expect(result.complete).toBe(false);
    expect(durationSeconds('P1DT2H')).toBe(93600);
    expect(durationSeconds('unknown')).toBeUndefined();
  });
  it('does not retry a search and exceed its reserved quota', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 429 }));
    vi.stubGlobal('fetch', fetch);
    await expect(
      new YouTubeSearchAdapter('key', ['AI']).fetch({ since: '2026-01-01', maxItems: 25 }),
    ).rejects.toMatchObject({ code: 'rate_limited' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
describe('X discovery', () => {
  it('splits the exact read reservation, deduplicates posts and repeated author links, marks only configured accounts', async () => {
    const requests: URL[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        requests.push(new URL(input));
        return json({
          data: [
            {
              id: 'a',
              text: 'AI release',
              created_at: new Date().toISOString(),
              author_id: '42',
              public_metrics: { like_count: 50, retweet_count: 9, reply_count: 4 },
              entities: { urls: [{ expanded_url: 'https://example.com/release?utm_source=x' }] },
            },
            {
              id: 'b',
              text: 'AI release repeated',
              created_at: new Date().toISOString(),
              author_id: '42',
              public_metrics: { like_count: 10 },
              entities: { urls: [{ expanded_url: 'https://example.com/release' }] },
            },
            {
              id: 'c',
              text: 'AI commentary',
              created_at: new Date().toISOString(),
              author_id: '99',
            },
            {
              id: 'r',
              text: 'AI repost',
              created_at: new Date().toISOString(),
              referenced_tweets: [{ type: 'retweeted' }],
            },
          ],
          meta: { next_token: 'more' },
        });
      }),
    );
    const result = await new XAdapter('token', 'AI -is:retweet', ['42']).fetch({
      since: new Date(Date.now() - 86400000).toISOString(),
      maxItems: 21,
    });
    expect(requests.map((u) => u.searchParams.get('sort_order'))).toEqual(['recency', 'relevancy']);
    expect(requests.reduce((n, u) => n + Number(u.searchParams.get('max_results')), 0)).toBe(21);
    expect(requests[0].searchParams.has('expansions')).toBe(false);
    expect(result.items.map((i) => i.externalId)).toEqual(['a', 'c']);
    expect(result.items[0].officialSource).toBe(true);
    expect(result.items[1].officialSource).toBe(false);
    expect(result.items[0].discovery).toHaveLength(2);
    expect(result.items[0].metrics?.repostCount).toBe(9);
    expect(result.complete).toBe(false);
  });
  it('keeps tiny read budgets to one request', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ data: [], meta: {} }));
    vi.stubGlobal('fetch', fetch);
    await new XAdapter('token').fetch({ since: new Date().toISOString(), maxItems: 19 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get('max_results')).toBe('19');
  });
});
it('rejects meaningless platform mixes', () => {
  expect(querySchema.safeParse({ sort: 'popular' }).success).toBe(false);
  expect(querySchema.safeParse({ source: 'x', kind: 'tutorial' }).success).toBe(false);
  expect(querySchema.safeParse({ source: 'youtube', kind: 'official' }).success).toBe(false);
  expect(
    querySchema.safeParse({ source: 'youtube', sort: 'popular', kind: 'tutorial' }).success,
  ).toBe(true);
});
