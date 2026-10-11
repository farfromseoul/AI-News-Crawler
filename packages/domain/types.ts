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
export interface NewsItem extends DiscoveryMetadata {
  id: string;
  source: Source;
  externalId: string;
  title: string;
  url: string;
  canonicalUrl: string;
  excerpt: string;
  author: string;
  publishedAt: string | null;
  collectedAt: string;
  sortAt: string;
  thumbnailUrl: string | null;
  tags: Topic[];
  score: number;
  contentKind: 'news' | 'tutorial';
  classificationReason: string | null;
  sections?: ('ai' | 'engineering')[];
  conferences?: string[];
  primaryTopic?: Topic;
}
export interface SourceStatus {
  source: Source;
  status: 'pending' | 'ok' | 'partial' | 'error' | 'not_configured' | 'budget_exhausted';
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  count: number;
  stale: boolean;
}
export interface FeedResponse {
  items: NewsItem[];
  nextCursor: string | null;
  total: number;
}
export interface Enricher {
  enrich(item: SourceItem): { tags: Topic[]; score: number } | null;
}

export interface FeedStats {
  total: number;
  topics: { tag: Topic; count: number }[];
  tags: { tag: Topic; count: number }[];
}
