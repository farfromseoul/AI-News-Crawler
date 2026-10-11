import {
  decodeCursor,
  encodeCursor,
  type FeedQuery,
  type FeedResponse,
  type NewsItem,
  type SourceStatus,
  queryScope,
} from '../domain';

interface Row {
  id: string;
  source: NewsItem['source'];
  external_id: string;
  title: string;
  url: string;
  canonical_url: string;
  excerpt: string;
  author: string;
  published_at: string | null;
  collected_at: string;
  sort_at: string;
  thumbnail_url: string | null;
  tags: string;
  score: number;
  author_id: string | null;
  discovery: string;
  points: number | null;
  view_count: number | null;
  like_count: number | null;
  reply_count: number | null;
  repost_count: number | null;
  comment_count: number | null;
  metrics_at: string | null;
  duration_seconds: number | null;
  content_kind: 'news' | 'tutorial';
  classification_reason: string | null;
  official_source: number;
}
function fromRow(row: Row): NewsItem {
  return {
    id: row.id,
    source: row.source,
    externalId: row.external_id,
    title: row.title,
    url: row.url,
    canonicalUrl: row.canonical_url,
    excerpt: row.excerpt,
    author: row.author,
    publishedAt: row.published_at,
    collectedAt: row.collected_at,
    sortAt: row.sort_at,
    thumbnailUrl: row.thumbnail_url,
    tags: JSON.parse(row.tags),
    score: row.score,
    authorId: row.author_id ?? undefined,
    discovery: JSON.parse(row.discovery),
    metrics: {
      points: row.points ?? undefined,
      viewCount: row.view_count ?? undefined,
      likeCount: row.like_count ?? undefined,
      replyCount: row.reply_count ?? undefined,
      repostCount: row.repost_count ?? undefined,
      commentCount: row.comment_count ?? undefined,
    },
    metricsAt: row.metrics_at ?? undefined,
    durationSeconds: row.duration_seconds ?? undefined,
    contentKind: row.content_kind,
    classificationReason: row.classification_reason,
    officialSource: !!row.official_source,
  };
}
export class NewsRepository {
  constructor(public db: D1Database) {}
  async upsert(items: NewsItem[]): Promise<number> {
    if (!items.length) return 0;
    let changes = 0;
    for (let offset = 0; offset < items.length; offset += 40) {
      const results = await this.db.batch(
        items.slice(offset, offset + 40).map((i) =>
          this.db
            .prepare(
              `
        INSERT INTO items(id,source,external_id,title,url,canonical_url,excerpt,author,published_at,collected_at,sort_at,thumbnail_url,tags,score,author_id,discovery,view_count,like_count,reply_count,repost_count,comment_count,metrics_at,duration_seconds,content_kind,classification_reason,official_source,points)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source,external_id) DO UPDATE SET
        title=excluded.title,url=excluded.url,canonical_url=excluded.canonical_url,excerpt=excluded.excerpt,
        author=excluded.author,published_at=excluded.published_at,thumbnail_url=excluded.thumbnail_url,tags=excluded.tags,score=excluded.score,
        sort_at=COALESCE(excluded.published_at,items.sort_at),
        author_id=excluded.author_id,discovery=excluded.discovery,view_count=excluded.view_count,
        like_count=excluded.like_count,reply_count=excluded.reply_count,repost_count=excluded.repost_count,
        comment_count=excluded.comment_count,metrics_at=excluded.metrics_at,duration_seconds=excluded.duration_seconds,
        content_kind=excluded.content_kind,classification_reason=excluded.classification_reason,official_source=excluded.official_source,points=excluded.points
      `,
            )
            .bind(
              i.id,
              i.source,
              i.externalId,
              i.title,
              i.url,
              i.canonicalUrl,
              i.excerpt,
              i.author,
              i.publishedAt,
              i.collectedAt,
              i.sortAt,
              i.thumbnailUrl,
              JSON.stringify(i.tags),
              i.score,
              i.authorId ?? null,
              JSON.stringify(i.discovery ?? []),
              i.metrics?.viewCount ?? null,
              i.metrics?.likeCount ?? null,
              i.metrics?.replyCount ?? null,
              i.metrics?.repostCount ?? null,
              i.metrics?.commentCount ?? null,
              i.metricsAt ?? null,
              i.durationSeconds ?? null,
              i.contentKind,
              i.classificationReason,
              i.officialSource ? 1 : 0,
              i.metrics?.points ?? null,
            ),
        ),
      );
      changes += results.reduce((n, r) => n + r.meta.changes, 0);
    }
    return changes;
  }
  async list(query: FeedQuery): Promise<FeedResponse> {
    const clauses: string[] = [],
      values: (string | number)[] = [];
    if (query.source) {
      clauses.push('source = ?');
      values.push(query.source);
    }
    if (query.tag) {
      clauses.push('EXISTS (SELECT 1 FROM json_each(items.tags) WHERE value = ?)');
      values.push(query.tag);
    }
    if (query.q) {
      clauses.push("title LIKE ? ESCAPE '\\'");
      values.push(`%${query.q.replace(/[\\%_]/g, '\\$&')}%`);
    }
    if (query.kind === 'tutorial') clauses.push("content_kind = 'tutorial'");
    if (query.kind === 'official') clauses.push('official_source = 1');
    if (query.sort === 'popular') {
      clauses.push('published_at >= ?');
      values.push(new Date(Date.now() - 7 * 86400000).toISOString());
      clauses.push(
        query.source === 'youtube' ? 'view_count IS NOT NULL' : 'like_count IS NOT NULL',
      );
    }
    if (query.period !== 'all') {
      clauses.push('sort_at >= ?');
      values.push(new Date(Date.now() - (query.period === '1d' ? 1 : 7) * 86400000).toISOString());
    }
    const where = () => (clauses.length ? `WHERE ${clauses.join(' AND ')}` : '');
    const rankColumn =
      query.source === 'youtube' ? 'COALESCE(view_count,-1)' : 'COALESCE(like_count,-1)';
    const order = `${query.sort === 'popular' ? `${rankColumn} DESC, ` : ''}sort_at DESC, id DESC`;
    // Apply channel diversity to the entire filtered set before pagination.
    const base = `WITH filtered AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY source,COALESCE(author_id,id) ORDER BY ${order}) AS author_rank FROM items ${where()}), eligible AS (SELECT * FROM filtered WHERE source != 'youtube' OR author_rank <= 3)`;
    const count = await this.db
      .prepare(`${base} SELECT COUNT(*) AS count FROM eligible`)
      .bind(...values)
      .first<{ count: number }>();
    let cursorWhere = '';
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      if (cursor.scope !== queryScope(query)) throw new Error('cursor_scope_mismatch');
      const tie = '(sort_at < ? OR (sort_at = ? AND id < ?))';
      if (query.sort === 'popular') {
        cursorWhere = `WHERE (${rankColumn} < ? OR (${rankColumn} = ? AND ${tie}))`;
        values.push(cursor.rank ?? -1, cursor.rank ?? -1, cursor.at, cursor.at, cursor.id);
      } else {
        cursorWhere = `WHERE ${tie}`;
        values.push(cursor.at, cursor.at, cursor.id);
      }
    }
    const result = await this.db
      .prepare(`${base} SELECT * FROM eligible ${cursorWhere} ORDER BY ${order} LIMIT ?`)
      .bind(...values, query.limit + 1)
      .all<Row>();
    const more = result.results.length > query.limit,
      items = result.results.slice(0, query.limit).map(fromRow);
    return {
      items,
      total: count?.count ?? 0,
      nextCursor: more ? encodeCursor(items[items.length - 1], query) : null,
    };
  }
  async get(id: string) {
    const row = await this.db.prepare('SELECT * FROM items WHERE id=?').bind(id).first<Row>();
    return row ? fromRow(row) : null;
  }
  async status(): Promise<SourceStatus[]> {
    const result = await this.db
      .prepare(
        `SELECT source_state.*, (SELECT COUNT(*) FROM items WHERE items.source=source_state.source) AS count FROM source_state`,
      )
      .all<{
        source: SourceStatus['source'];
        status: SourceStatus['status'];
        last_attempt_at: string | null;
        last_success_at: string | null;
        count: number;
      }>();
    return result.results.map((s) => ({
      source: s.source,
      status: s.status,
      lastAttemptAt: s.last_attempt_at,
      lastSuccessAt: s.last_success_at,
      count: s.count,
      stale: !!s.last_success_at && Date.now() - Date.parse(s.last_success_at) > 26 * 3600000,
    }));
  }
}
