import type { z } from 'zod';
import type {
  newsItemSchema,
  sourceStatusSchema,
  feedResponseSchema,
  feedStatsSchema,
} from '../contracts/news';
export const sources = [
  'geeknews',
  'x',
  'youtube',
  'hackernews',
  'cncf',
  'thenewstack',
  'infoq',
  'aws',
  'kubernetes',
  'cloudflare',
  'martinfowler',
  'bytebytego',
] as const;
export type Source = (typeof sources)[number];
export const topicLabels = {
  models: '모델·연구',
  dev: '개발 도구',
  opensource: '오픈소스',
  industry: '산업·인사이트',
  'cloud-native': 'Cloud Native',
  platform: 'Platform / DevOps',
  architecture: '아키텍처',
  reliability: 'SRE / 안정성',
  security: '보안·Identity',
  'ai-infra': 'AI 인프라',
  cloud: '클라우드',
  networking: '네트워크',
  kubernetes: 'Kubernetes',
  terraform: 'Terraform / IaC',
  observability: '관측성',
  iam: 'IAM / OAuth',
  cicd: 'CI/CD',
  database: '데이터베이스',
} as const;
export type Topic = keyof typeof topicLabels;
export const sourceLabels: Record<Source, string> = {
  geeknews: 'GeekNews',
  x: 'X',
  youtube: 'YouTube',
  hackernews: 'Hacker News',
  cncf: 'CNCF Blog',
  thenewstack: 'The New Stack',
  infoq: 'InfoQ',
  aws: 'AWS What’s New',
  kubernetes: 'Kubernetes Blog',
  cloudflare: 'Cloudflare Blog',
  martinfowler: 'Martin Fowler',
  bytebytego: 'ByteByteGo',
};
export interface DiscoveryMetadata {
  authorId?: string;
  discovery?: string[];
  metrics?: {
    points?: number;
    viewCount?: number;
    likeCount?: number;
    replyCount?: number;
    repostCount?: number;
    commentCount?: number;
  };
  metricsAt?: string;
  durationSeconds?: number;
  officialSource?: boolean;
}
export interface SourceItem extends DiscoveryMetadata {
  source: Source;
  externalId: string;
  title: string;
  url: string;
  excerpt?: string;
  author?: string;
  publishedAt?: string;
  thumbnailUrl?: string;
}
export type NewsItem = z.infer<typeof newsItemSchema>;
export type SourceStatus = z.infer<typeof sourceStatusSchema>;
export type FeedResponse = z.infer<typeof feedResponseSchema>;
export interface Enricher {
  enrich(item: SourceItem): { tags: Topic[]; score: number } | null;
}

export type FeedStats = z.infer<typeof feedStatsSchema>;
