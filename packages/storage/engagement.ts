import { DAY, kstDay } from '../engagement/model';
export class EngagementRepository {
  constructor(private db: D1Database) {}
  async validVisitor(hash: string, now: number) {
    return !!await this.db.prepare('SELECT visitor_hash FROM engagement_visitors WHERE visitor_hash=? AND expires_at>?').bind(hash, now).first();
  }
  async createVisitor(hash: string, now: number) {
    await this.db.prepare('INSERT INTO engagement_visitors(visitor_hash,created_at,expires_at) VALUES(?,?,?)').bind(hash, now, now + 180 * DAY).run();
  }
  async visit(hash: string, now = Date.now()) {
    await this.db.prepare('INSERT OR IGNORE INTO engagement_daily_visitors(day_kst,visitor_hash) VALUES(?,?)').bind(kstDay(now), hash).run();
    return { day: kstDay(now) };
  }
  async stats(now = Date.now()) {
    const day = kstDay(now);
    const result = await this.db.prepare('SELECT COUNT(DISTINCT CASE WHEN day_kst=? THEN visitor_hash END) AS today, COUNT(DISTINCT visitor_hash) AS visitors30d FROM engagement_daily_visitors WHERE day_kst BETWEEN ? AND ?').bind(day, kstDay(now - 29 * DAY), day).first<{ today: number; visitors30d: number }>();
    const meta = await this.db.prepare("SELECT value FROM engagement_metadata WHERE key='tracking_started_at'").first<{ value: string }>();
    return { today: result?.today ?? 0, visitors30d: result?.visitors30d ?? 0, day, timezone: 'Asia/Seoul' as const, asOf: new Date(now).toISOString(), trackingStartedAt: meta?.value ?? null };
  }
  async states(ids: string[], visitor: string | null) {
    if (!ids.length) return [];
    const result = await this.db.prepare(`SELECT i.id, COUNT(l.visitor_hash) AS count, COALESCE(MAX(l.visitor_hash=?),0) AS liked FROM items i LEFT JOIN engagement_item_likes l ON l.item_id=i.id WHERE i.id IN (${ids.map(() => '?').join(',')}) GROUP BY i.id`).bind(visitor ?? '', ...ids).all<{ id: string; count: number; liked: number }>();
    return result.results.map(row => ({ ...row, liked: !!row.liked }));
  }
  async like(id: string, visitor: string, desired: boolean) {
    if (!await this.db.prepare('SELECT id FROM items WHERE id=?').bind(id).first()) return null;
    // One statement per mutation; the composite primary key is the concurrency boundary.
    const result = desired
      ? await this.db.prepare('INSERT OR IGNORE INTO engagement_item_likes(item_id,visitor_hash,created_at) SELECT id,?,? FROM items WHERE id=?').bind(visitor, Date.now(), id).run()
      : await this.db.prepare('DELETE FROM engagement_item_likes WHERE item_id=? AND visitor_hash=?').bind(id, visitor).run();
    const state = (await this.states([id], visitor))[0];
    return state ? { ...state, changed: result.meta.changes > 0 } : null;
  }
}
