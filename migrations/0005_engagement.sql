CREATE TABLE engagement_visitors (
  visitor_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE engagement_daily_visitors (
  day_kst TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  PRIMARY KEY(day_kst,visitor_hash)
);
CREATE TABLE engagement_item_likes (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  visitor_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(item_id,visitor_hash)
);
CREATE TABLE engagement_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO engagement_metadata(key,value) VALUES ('tracking_started_at',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
