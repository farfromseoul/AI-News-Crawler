import he from 'he';
import { z } from 'zod';

import { sources, type SourceItem, type NewsItem, type Topic, type Enricher } from './types';
export * from './types';

export function plainText(input: string): string {
  return he
    .decode(
      input
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]*>/g, ' '),
    )
    .replace(/\s+/g, ' ')
    .trim();
}
export function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  for (const key of [...url.searchParams.keys()])
    if (/^utm_/i.test(key) || ['fbclid', 'gclid'].includes(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.href;
}
const aiPattern =
  /\b(?:AI|LLMs?|GPT(?:-?\d)?|ChatGPT|OpenAI|Anthropic|Claude|Gemini|DeepSeek|Codex|Llama|Qwen|Copilot|Mistral|Midjourney)\b|인공지능|생성형|언어\s?모델|머신러닝|딥러닝|신경망/i;
export class RuleBasedEnricher implements Enricher {
  enrich(item: SourceItem) {
    const title = plainText(item.title),
      text = `${title} ${plainText(item.excerpt ?? '')}`;
    if (!aiPattern.test(text)) return null;
    const tags: Topic[] = [];
    if (/모델|연구|논문|benchmark|model|gpt|llm|gemini|claude|llama/i.test(text))
      tags.push('models');
    if (/개발|코딩|코드|도구|agent|에이전트|sdk|api|codex|cursor|tool/i.test(text))
      tags.push('dev');
    if (/오픈소스|오픈 소스|open.source|github|hugging\s?face/i.test(text)) tags.push('opensource');
    if (!tags.length || /투자|인수|산업|시장|기업|정책|안전|비용|가격|산업|매출/i.test(text))
      tags.push('industry');
    return { tags, score: aiPattern.test(title) ? 90 : 60 };
  }
}
export function normalize(
  item: SourceItem,
  at = new Date().toISOString(),
  enricher: Enricher = new RuleBasedEnricher(),
): NewsItem | null {
  const url = safeUrl(item.url),
    title = plainText(item.title).slice(0, 500),
    enriched = enricher.enrich(item);
  if (!url || !title || !item.externalId || !enriched) return null;
  const time = item.publishedAt ? new Date(item.publishedAt) : null;
  const publishedAt = time && Number.isFinite(time.getTime()) ? time.toISOString() : null;
  return {
    id: `${item.source}:${item.externalId}`,
    source: item.source,
    externalId: item.externalId,
    title,
    url,
    canonicalUrl: canonicalUrl(url),
    excerpt: plainText(item.excerpt ?? '').slice(0, 700),
    author: plainText(item.author ?? '').slice(0, 100),
    publishedAt,
    collectedAt: at,
    sortAt: publishedAt ?? at,
    thumbnailUrl: item.thumbnailUrl ? safeUrl(item.thumbnailUrl) : null,
    authorId: item.authorId,
    discovery: item.discovery ?? [],
    metrics: item.metrics,
    metricsAt: item.metricsAt,
    durationSeconds: item.durationSeconds,
    officialSource: item.source === 'x' && !!item.officialSource,
    contentKind:
      item.source === 'youtube' &&
      /튜토리얼|사용법|따라\s?하기|입문|강좌|tutorial|how to|step.by.step/i.test(title)
        ? 'tutorial'
        : 'news',
    classificationReason:
      item.source === 'youtube' &&
      /튜토리얼|사용법|따라\s?하기|입문|강좌|tutorial|how to|step.by.step/i.test(title)
        ? '영상 제목의 사용법·강좌 표현으로 분류'
        : null,
    ...enriched,
  };
}
export const querySchema = z
  .object({
    source: z.enum(sources).optional(),
    tag: z.enum(['models', 'dev', 'opensource', 'industry']).optional(),
    q: z.string().trim().max(120).optional(),
    period: z.enum(['all', '1d', '7d']).default('all'),
    limit: z.coerce.number().int().min(1).max(50).default(18),
    cursor: z.string().max(4096).optional(),
    sort: z.enum(['latest', 'popular']).default('latest'),
    kind: z.enum(['all', 'tutorial', 'official']).default('all'),
  })
  .refine(
    (q) => q.sort !== 'popular' || q.source === 'youtube' || q.source === 'x',
    'Popularity requires a single supported platform',
  )
  .refine(
    (q) => q.kind !== 'tutorial' || q.source === 'youtube',
    'Tutorial filter requires YouTube',
  )
  .refine((q) => q.kind !== 'official' || q.source === 'x', 'Official filter requires X');
export type FeedQuery = z.infer<typeof querySchema>;
export const cursorSchema = z.object({
  at: z.iso.datetime(),
  id: z.string().min(1).max(500),
  rank: z.number().min(-1).optional(),
  scope: z.string().max(1000).optional(),
});
export function queryScope(query: FeedQuery) {
  return JSON.stringify([query.source, query.tag, query.q, query.period, query.sort, query.kind]);
}
export function encodeCursor(item: NewsItem, query?: FeedQuery) {
  const json = JSON.stringify({
    at: item.sortAt,
    id: item.id,
    ...(query
      ? {
          rank:
            query.sort === 'popular'
              ? ((item.source === 'youtube' ? item.metrics?.viewCount : item.metrics?.likeCount) ??
                -1)
              : undefined,
          scope: queryScope(query),
        }
      : {}),
  });
  return btoa(String.fromCharCode(...new TextEncoder().encode(json)));
}
export function decodeCursor(value: string) {
  return cursorSchema.parse(
    JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value), (c) => c.charCodeAt(0)))),
  );
}
