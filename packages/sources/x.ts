import { z } from 'zod';
import { canonicalUrl, safeUrl } from '../domain';
import type { SourceItem } from '../domain/types';
import type { FetchInput, SourceAdapter } from './index';
import { request } from './http';

export const defaultXQuery =
  '(OpenAI OR Anthropic OR LLM OR "AI agent" OR 인공지능) -is:retweet -is:reply';
const counter = z.number().int().nonnegative().optional();
const postsSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        created_at: z.string(),
        author_id: z.string().optional(),
        public_metrics: z
          .object({
            like_count: counter,
            reply_count: counter,
            retweet_count: counter,
            repost_count: counter,
          })
          .optional(),
        referenced_tweets: z.array(z.object({ type: z.string() })).optional(),
        entities: z
          .object({ urls: z.array(z.object({ expanded_url: z.string().optional() })).optional() })
          .optional(),
      }),
    )
    .default([]),
  meta: z.object({ next_token: z.string().optional() }).optional(),
});

export class XAdapter implements SourceAdapter {
  source = 'x' as const;
  constructor(
    private token: string,
    private query: string = defaultXQuery,
    private officialAuthors: string[] = [],
  ) {}
  async fetch({ since, maxItems }: FetchInput) {
    if (maxItems < 10) return { items: [], complete: false };
    // Split the reserved read budget across newest and relevance searches; never exceed it.
    const cap = Math.min(100, Math.floor(maxItems));
    const requests =
      cap >= 20
        ? [
            { sort: 'recency', size: Math.floor(cap / 2) },
            { sort: 'relevancy', size: cap - Math.floor(cap / 2) },
          ]
        : [{ sort: 'recency', size: cap }];
    const byId = new Map<string, SourceItem>(),
      dedupKeys = new Map<string, string>();
    let complete = true;
    const now = new Date().toISOString();
    for (const page of requests) {
      const url = new URL('https://api.x.com/2/tweets/search/recent');
      url.search = new URLSearchParams({
        query: this.query,
        start_time: since,
        max_results: String(page.size),
        sort_order: page.sort,
        'tweet.fields': 'created_at,author_id,public_metrics,entities,referenced_tweets',
      }).toString();
      const data = postsSchema.parse(
        await (
          await request(url.href, { headers: { Authorization: `Bearer ${this.token}` } }, 0)
        ).json(),
      );
      if (data.meta?.next_token) complete = false;
      for (const p of data.data) {
        if (p.referenced_tweets?.some((r) => r.type === 'retweeted')) continue;
        const existing = byId.get(p.id);
        const discovery = [...(existing?.discovery ?? []), `${page.sort}:${this.query}`];
        byId.set(p.id, {
          source: this.source,
          externalId: p.id,
          title: p.text.slice(0, 140),
          excerpt: p.text,
          url: `https://x.com/i/status/${p.id}`,
          author: p.author_id ? `X · ${p.author_id}` : 'X',
          authorId: p.author_id,
          publishedAt: p.created_at,
          discovery,
          officialSource: !!p.author_id && this.officialAuthors.includes(p.author_id),
          metricsAt: now,
          metrics: {
            likeCount: p.public_metrics?.like_count,
            replyCount: p.public_metrics?.reply_count,
            repostCount: p.public_metrics?.retweet_count ?? p.public_metrics?.repost_count,
          },
        });
        // The key is only for repeat-promotion filtering; original post URLs remain intact.
        const external = p.entities?.urls
          ?.map((u) => u.expanded_url)
          .find(
            (u) =>
              u && safeUrl(u) && !['x.com', 'twitter.com', 't.co'].includes(new URL(u).hostname),
          );
        dedupKeys.set(
          p.id,
          `${p.author_id ?? p.id}:${
            external
              ? canonicalUrl(external)
              : p.text
                  .replace(/https?:\/\/\S+/g, '')
                  .replace(/\s+/g, ' ')
                  .trim()
          }`,
        );
      }
    }
    const seen = new Set<string>();
    const items = [...byId.values()]
      .sort((a, b) => (b.metrics?.likeCount ?? -1) - (a.metrics?.likeCount ?? -1))
      .filter((p) => {
        const key = dedupKeys.get(p.externalId) ?? p.externalId;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return { items, complete };
  }
}
