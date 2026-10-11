import { z } from 'zod';
import type { SourceItem } from '../domain/types';
import type { FetchInput, SourceAdapter } from './index';
import { request, SourceError } from './http';

const defaults = ['AI 에이전트', '생성형 AI', 'LLM', 'AI coding'];
export function youtubeQueries(raw?: string): string[] {
  return [...new Set((raw ? raw.split('|') : defaults).map((q) => q.trim()).filter(Boolean))].slice(
    0,
    4,
  );
}
const searchSchema = z.object({
  items: z.array(z.object({ id: z.object({ videoId: z.string().optional() }) })).default([]),
  nextPageToken: z.string().optional(),
});
const counter = z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional();
const videosSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        snippet: z.object({
          title: z.string(),
          description: z.string().default(''),
          channelId: z.string(),
          channelTitle: z.string(),
          publishedAt: z.string(),
          liveBroadcastContent: z.string().optional(),
          thumbnails: z.object({ medium: z.object({ url: z.string() }).optional() }).optional(),
        }),
        statistics: z
          .object({ viewCount: counter, likeCount: counter, commentCount: counter })
          .optional(),
        contentDetails: z.object({ duration: z.string() }).optional(),
      }),
    )
    .default([]),
});
export function durationSeconds(value?: string): number | undefined {
  const m = value?.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
  return m
    ? Math.floor(
        Number(m[1] ?? 0) * 86400 +
          Number(m[2] ?? 0) * 3600 +
          Number(m[3] ?? 0) * 60 +
          Number(m[4] ?? 0),
      )
    : undefined;
}
export class YouTubeSearchAdapter implements SourceAdapter {
  source = 'youtube' as const;
  constructor(
    private key: string,
    private queries: string[] = youtubeQueries(),
    private lookbackDays?: number,
  ) {}
  private async get(path: string, params: Record<string, string>) {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    url.search = new URLSearchParams({ ...params, key: this.key }).toString();
    // The collector reserves a fixed search budget. No hidden retry calls.
    return (await request(url.href, {}, 0)).json();
  }
  async fetch({ maxItems }: FetchInput) {
    const queries = [...new Set(this.queries.map((q) => q.trim()).filter(Boolean))].slice(0, 4);
    if (!queries.length) throw new SourceError('invalid_queries');
    const now = new Date(),
      discovered = new Map<string, Set<string>>();
    let complete = true;
    // Each topic gets one fresh page and one recent-popular page: at most 8 search calls.
    const pages: string[][] = [];
    for (const query of queries)
      for (const order of ['date', 'viewCount']) {
        const since = new Date(
          now.getTime() - (this.lookbackDays ?? (order === 'date' ? 2 : 7)) * 86400000,
        ).toISOString();
        const data = searchSchema.parse(
          await this.get('search', {
            part: 'snippet',
            type: 'video',
            q: query,
            order,
            publishedAfter: since,
            maxResults: '25',
            relevanceLanguage: /[가-힣]/.test(query) ? 'ko' : 'en',
            safeSearch: 'moderate',
          }),
        );
        if (data.nextPageToken) complete = false;
        const ids: string[] = [];
        for (const item of data.items)
          if (item.id.videoId) {
            const id = item.id.videoId;
            const methods = discovered.get(id) ?? new Set<string>();
            methods.add(`${order === 'date' ? 'latest' : 'popular'}:${query}`);
            discovered.set(id, methods);
            ids.push(id);
          }
        pages.push(ids);
      }
    // Interleave query/order results before the cap, so one topic cannot consume the budget.
    const ids: string[] = [];
    const seen = new Set<string>();
    for (let offset = 0; offset < 25; offset++)
      for (const page of pages) {
        const id = page[offset];
        if (id && !seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
    if (ids.length > maxItems) complete = false;
    const selected = ids.slice(0, maxItems),
      items: SourceItem[] = [];
    for (let offset = 0; offset < selected.length; offset += 50) {
      const data = videosSchema.parse(
        await this.get('videos', {
          part: 'snippet,statistics,contentDetails',
          id: selected.slice(offset, offset + 50).join(','),
        }),
      );
      for (const v of data.items) {
        if (v.snippet.liveBroadcastContent && v.snippet.liveBroadcastContent !== 'none') continue;
        // Search indexes can return stale/out-of-range records. Recheck publication time.
        if (
          !Number.isFinite(Date.parse(v.snippet.publishedAt)) ||
          Date.parse(v.snippet.publishedAt) < now.getTime() - 7 * 86400000
        )
          continue;
        items.push({
          source: this.source,
          externalId: v.id,
          title: v.snippet.title,
          url: `https://www.youtube.com/watch?v=${v.id}`,
          excerpt: v.snippet.description,
          author: v.snippet.channelTitle,
          authorId: v.snippet.channelId,
          publishedAt: v.snippet.publishedAt,
          thumbnailUrl: v.snippet.thumbnails?.medium?.url,
          discovery: [...(discovered.get(v.id) ?? [])],
          metrics: {
            viewCount: v.statistics?.viewCount,
            likeCount: v.statistics?.likeCount,
            commentCount: v.statistics?.commentCount,
          },
          metricsAt: now.toISOString(),
          durationSeconds: durationSeconds(v.contentDetails?.duration),
        });
      }
    }
    return { items, complete };
  }
}
