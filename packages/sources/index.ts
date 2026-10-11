import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { z } from 'zod';
import type { Source, SourceItem } from '../domain';
import { safeUrl } from '../domain';

export interface FetchInput {
  since: string;
  maxItems: number;
}
export interface SourceAdapter {
  source: Source;
  fetch(input: FetchInput): Promise<{ items: SourceItem[]; complete: boolean }>;
}
import { request, SourceError } from './http';
export { request, SourceError } from './http';
export { YouTubeSearchAdapter, youtubeQueries } from './youtube-search';
export { XAdapter } from './x';
const entrySchema = z
  .object({
    id: z.string(),
    title: z.string(),
    published: z.string().optional(),
    updated: z.string().optional(),
    content: z
      .union([z.string(), z.object({ '#text': z.string().optional() }).passthrough()])
      .optional(),
    author: z.object({ name: z.string().optional() }).optional(),
    link: z.union([
      z.object({ '@_href': z.string(), '@_rel': z.string().optional() }),
      z.array(z.object({ '@_href': z.string(), '@_rel': z.string().optional() })),
    ]),
  })
  .passthrough();
export function parseGeekNews(xml: string): SourceItem[] {
  if (
    xml.length > 2_000_000 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    throw new SourceError('invalid_feed');
  const feed = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true,
  }).parse(xml)?.feed;
  if (!feed) throw new SourceError('invalid_feed');
  const entries = feed.entry ? (Array.isArray(feed.entry) ? feed.entry : [feed.entry]) : [];
  return entries.flatMap((raw: unknown) => {
    const parsed = entrySchema.safeParse(raw);
    if (!parsed.success) return [];
    const e = parsed.data,
      links = Array.isArray(e.link) ? e.link : [e.link];
    const url = links.find((l) => l['@_rel'] === 'alternate')?.['@_href'] ?? links[0]?.['@_href'];
    if (!url || !safeUrl(url)) return [];
    const id = new URL(url).searchParams.get('id') ?? e.id;
    return [
      {
        source: 'geeknews' as const,
        externalId: id,
        title: e.title,
        url,
        excerpt: typeof e.content === 'string' ? e.content : (e.content?.['#text'] ?? ''),
        author: e.author?.name,
        publishedAt: e.published ?? e.updated,
      },
    ];
  });
}
export class GeekNewsAdapter implements SourceAdapter {
  source = 'geeknews' as const;
  async fetch({ since, maxItems }: FetchInput) {
    const response = await request('https://news.hada.io/rss/news', {
      headers: { Accept: 'application/atom+xml' },
    });
    const items = parseGeekNews(await response.text()).filter(
      (i) => !i.publishedAt || Date.parse(i.publishedAt) >= Date.parse(since),
    );
    return { items: items.slice(0, maxItems), complete: items.length <= maxItems };
  }
}

export { HackerNewsAdapter } from './hackernews';
