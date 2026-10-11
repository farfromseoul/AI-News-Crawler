import { z } from 'zod';
import { sources, topicLabels } from '../domain/types';

const topic = z.enum(
  Object.keys(topicLabels) as [keyof typeof topicLabels, ...(keyof typeof topicLabels)[]],
);
const count = z.number().int().nonnegative();
export const newsItemSchema = z.object({
  id: z.string(),
  source: z.enum(sources),
  externalId: z.string(),
  title: z.string(),
  url: z.string(),
  canonicalUrl: z.string(),
  excerpt: z.string(),
  author: z.string(),
  publishedAt: z.string().nullable(),
  collectedAt: z.string(),
  sortAt: z.string(),
  thumbnailUrl: z.string().nullable(),
  tags: z.array(topic),
  score: z.number(),
  contentKind: z.enum(['news', 'tutorial']),
  classificationReason: z.string().nullable(),
  sections: z.array(z.enum(['ai', 'engineering'])).optional(),
  conferences: z.array(z.string()).optional(),
  primaryTopic: topic.optional(),
  authorId: z.string().optional(),
  discovery: z.array(z.string()).optional(),
  metrics: z
    .object({
      points: z.number().optional(),
      viewCount: z.number().optional(),
      likeCount: z.number().optional(),
      replyCount: z.number().optional(),
      repostCount: z.number().optional(),
      commentCount: z.number().optional(),
    })
    .optional(),
  metricsAt: z.string().optional(),
  durationSeconds: z.number().optional(),
  officialSource: z.boolean().optional(),
});
export const sourceStatusSchema = z.object({
  source: z.enum(sources),
  status: z.enum(['pending', 'ok', 'partial', 'error', 'not_configured', 'budget_exhausted']),
  lastAttemptAt: z.string().nullable(),
  lastSuccessAt: z.string().nullable(),
  count,
  stale: z.boolean(),
});
export const feedResponseSchema = z.object({
  items: z.array(newsItemSchema),
  nextCursor: z.string().nullable(),
  total: count,
});
export const feedStatsSchema = z.object({
  total: count,
  topics: z.array(z.object({ tag: topic, count })),
  tags: z.array(z.object({ tag: topic, count })),
});
export const sourceResponseSchema = z.object({ sources: z.array(sourceStatusSchema) });
export const errorSchema = z.object({
  error: z.enum(['invalid_query', 'invalid_cursor', 'not_found', 'service_unavailable']),
});
