import { afterEach, expect, it, vi } from 'vitest';
import { HackerNewsAdapter } from '../packages/sources/hackernews';
import { normalize } from '../packages/domain';
afterEach(() => vi.unstubAllGlobals());
it('merges newest and top IDs, skips dead stories, retains metrics and filters non-AI', async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      const data = url.includes('newstories')
        ? [1, 2, 3]
        : url.includes('topstories')
          ? [1, 4]
          : {
              id: Number(url.match(/item\/(\d+)/)?.[1]),
              type: 'story',
              time: Date.now() / 1000,
              title: url.includes('/4.') ? 'Cooking recipes' : 'AI agent launch',
              dead: url.includes('/2.'),
              url: url.includes('/1.') ? 'https://example.com/ai-news' : undefined,
              score: 123,
              descendants: 7,
            };
      return new Response(JSON.stringify(data));
    }),
  );
  const result = await new HackerNewsAdapter().fetch({
    since: '2020-01-01T00:00:00.000Z',
    maxItems: 100,
  });
  expect(calls).toHaveLength(6);
  expect(result.complete).toBe(true);
  expect(result.items).toHaveLength(3);
  expect(result.items[0].discovery).toEqual(['latest', 'top']);
  const items = result.items.map((i) => normalize(i)).filter(Boolean);
  expect(items).toHaveLength(2);
  expect(items[0]?.metrics).toEqual({ points: 123, commentCount: 7 });
  expect(items[0]?.url).toBe('https://example.com/ai-news');
  expect(items[1]?.url).toBe('https://news.ycombinator.com/item?id=3');
});
it('respects the lookup cap and reports partial results', async () => {
  const mock = vi.fn(
    async (url: string) => new Response(JSON.stringify(url.includes('stories') ? [1, 2, 3] : null)),
  );
  vi.stubGlobal('fetch', mock);
  expect((await new HackerNewsAdapter().fetch({ since: '', maxItems: 1 })).complete).toBe(false);
  expect(mock).toHaveBeenCalledTimes(3);
});
