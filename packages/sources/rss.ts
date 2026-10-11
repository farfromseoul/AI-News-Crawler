import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { engineeringFeeds, safeUrl, plainText, type SourceItem } from '../domain';
import type { FetchInput, SourceAdapter } from './index';
import { request, SourceError } from './http';
export type FeedSource = keyof typeof engineeringFeeds;
const array = (v: any): any[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const text = (v: any): string =>
  typeof v === 'string' ? v : typeof v?.['#text'] === 'string' ? v['#text'] : '';
export function parseRss(xml: string, source: FeedSource): SourceItem[] {
  if (
    xml.length > 2_000_000 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    throw new SourceError('invalid_feed');
  const data = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true,
  }).parse(xml);
  if (data.rss?.channel === undefined && data.feed === undefined)
    throw new SourceError('invalid_feed');
  const entries = array(data.rss?.channel?.item ?? data.feed?.entry);
  return entries.slice(0, 100).flatMap((entry): SourceItem[] => {
    const link =
      typeof entry.link === 'string'
        ? entry.link
        : array(entry.link).find((l) => !l['@_rel'] || l['@_rel'] === 'alternate')?.['@_href'];
    const url = typeof link === 'string' ? safeUrl(link) : null;
    const title = text(entry.title);
    if (!url || !title) return [];
    return [
      {
        source,
        externalId: text(entry.guid) || text(entry.id) || url,
        url,
        title,
        // Store only a short public-feed excerpt, never fetch paid article bodies.
        excerpt: plainText(
          text(entry.description) ||
            text(entry.summary) ||
            text(entry.content) ||
            text(entry['content:encoded']),
        ).slice(0, 700),
        author: text(entry['dc:creator']) || text(entry.author?.name) || text(entry.author),
        publishedAt:
          text(entry.pubDate) || text(entry.published) || text(entry.updated) || undefined,
      },
    ];
  });
}
export class RssAdapter implements SourceAdapter {
  constructor(public source: FeedSource) {}
  async fetch({ since, maxItems }: FetchInput) {
    const response = await request(
      engineeringFeeds[this.source].url,
      { headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml' } },
      0,
    );
    // Bound streamed body before XML parsing.
    const reader = response.body?.getReader();
    if (!reader) throw new SourceError('invalid_feed');
    const decoder = new TextDecoder();
    let xml = '',
      bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 2_000_000) throw new SourceError('feed_too_large');
        xml += decoder.decode(value, { stream: true });
      }
      xml += decoder.decode();
    } finally {
      await reader.cancel();
    }
    const items = parseRss(xml, this.source).filter(
      (i) =>
        !i.publishedAt ||
        !Number.isFinite(Date.parse(i.publishedAt)) ||
        Date.parse(i.publishedAt) >= Date.parse(since),
    );
    return {
      items: items.slice(0, Math.min(50, maxItems)),
      complete: items.length <= Math.min(50, maxItems),
    };
  }
}
