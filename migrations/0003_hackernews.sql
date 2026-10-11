CREATE TABLE items_new (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK(source IN ('geeknews','x','youtube','hackernews')),
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  collected_at TEXT NOT NULL,
  sort_at TEXT NOT NULL,
  thumbnail_url TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  score INTEGER NOT NULL DEFAULT 0,
  author_id TEXT,
  discovery TEXT NOT NULL DEFAULT '[]',
  view_count INTEGER,
  like_count INTEGER,
  reply_count INTEGER,
  repost_count INTEGER,
  comment_count INTEGER,
  metrics_at TEXT,
  duration_seconds INTEGER,
  content_kind TEXT NOT NULL DEFAULT 'news',
  classification_reason TEXT,
  official_source INTEGER NOT NULL DEFAULT 0,
  points INTEGER,
  UNIQUE(source, external_id)
);

INSERT INTO items_new SELECT items.*, NULL FROM items;
DROP TABLE items;
ALTER TABLE items_new RENAME TO items;
CREATE INDEX items_source_date ON items(source, sort_at DESC, id DESC);
CREATE INDEX items_date ON items(sort_at DESC, id DESC);
CREATE INDEX items_canonical ON items(canonical_url);
CREATE INDEX items_views ON items(source, view_count DESC, sort_at DESC, id DESC);
CREATE INDEX items_likes ON items(source, like_count DESC, sort_at DESC, id DESC);
INSERT INTO source_state(source,status) VALUES ('hackernews','pending');
