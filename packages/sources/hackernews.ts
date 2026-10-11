import { z } from 'zod';
import { safeUrl, type SourceItem } from '../domain';
import type { FetchInput, SourceAdapter } from './index';
import { request, SourceError } from './http';
const idsSchema = z.array(z.number().int().positive());
const storySchema = z
  .object({
    id: z.number().int(),
    type: z.string(),
    title: z.string().optional(),
    url: z.string().optional(),
    by: z.string().optional(),
    time: z.number().optional(),
    text: z.string().optional(),
    score: z.number().int().optional(),
    descendants: z.number().int().nonnegative().optional(),
    deleted: z.boolean().optional(),
    dead: z.boolean().optional(),
  })
  .nullable();
export class HackerNewsAdapter implements SourceAdapter {
  source = 'hackernews' as const;
  async fetch({ since, maxItems }: FetchInput) {
    const get = async (path: string) =>
      (await request(`https://hacker-news.firebaseio.com/v0/${path}.json`, {}, 0)).json();
    const [fresh, top] = await Promise.all(
      ['newstories', 'topstories'].map(async (p) => idsSchema.parse(await get(p))),
    );
    const candidates = [
      ...new Set(
        Array.from({ length: Math.max(fresh.length, top.length) }, (_, i) => [fresh[i], top[i]])
          .flat()
          .filter((id): id is number => id !== undefined),
      ),
    ];
    const selected = candidates.slice(0, Math.min(maxItems, 30));
    const items: SourceItem[] = [];
    let failures = 0;
    const now = new Date().toISOString();
    // Five concurrent reads, at most 30 item lookups per run.
    for (let offset = 0; offset < selected.length; offset += 5) {
      const results = await Promise.allSettled(
        selected.slice(offset, offset + 5).map(async (id) => {
          const story = storySchema.parse(await get(`item/${id}`));
          if (
            !story ||
            story.deleted ||
            story.dead ||
            story.type !== 'story' ||
            !story.title ||
            !story.time
          )
            return;
          const publishedAt = new Date(story.time * 1000).toISOString();
          if (publishedAt < since) return;
          return {
            source: this.source,
            externalId: String(story.id),
            title: story.title,
            url:
              (story.url && safeUrl(story.url)) ||
              `https://news.ycombinator.com/item?id=${story.id}`,
            excerpt: story.text ?? '',
            author: story.by,
            authorId: story.by,
            publishedAt,
            discovery: [fresh.includes(id) ? 'latest' : '', top.includes(id) ? 'top' : ''].filter(
              Boolean,
            ),
            metrics: { points: story.score, commentCount: story.descendants },
            metricsAt: now,
          } satisfies SourceItem;
        }),
      );
      for (const result of results) {
        if (result.status === 'rejected') failures++;
        else if (result.value) items.push(result.value);
      }
    }
    if (selected.length && failures === selected.length) throw new SourceError('upstream_error');
    return { items, complete: !failures && selected.length === candidates.length };
  }
}
