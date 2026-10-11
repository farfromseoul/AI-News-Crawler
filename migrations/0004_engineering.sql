CREATE TABLE items_new (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK(source IN ('geeknews','x','youtube','hackernews','cncf','thenewstack','infoq','aws','kubernetes','cloudflare','martinfowler','bytebytego')),
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

INSERT INTO items_new SELECT * FROM items;
DROP TABLE items;
ALTER TABLE items_new RENAME TO items;
CREATE INDEX items_source_date ON items(source, sort_at DESC, id DESC);
CREATE INDEX items_date ON items(sort_at DESC, id DESC);
CREATE INDEX items_canonical ON items(canonical_url);
CREATE INDEX items_views ON items(source, view_count DESC, sort_at DESC, id DESC);
CREATE INDEX items_likes ON items(source, like_count DESC, sort_at DESC, id DESC);

ALTER TABLE items ADD COLUMN sections TEXT NOT NULL DEFAULT '["ai"]';
ALTER TABLE items ADD COLUMN conferences TEXT NOT NULL DEFAULT '[]';
ALTER TABLE items ADD COLUMN primary_topic TEXT NOT NULL DEFAULT 'industry';
UPDATE items SET primary_topic=COALESCE(json_extract(tags,'$[0]'),'industry');
INSERT INTO source_state(source,status) VALUES ('cncf','pending'),('thenewstack','pending'),('infoq','pending'),('aws','pending'),('kubernetes','pending'),('cloudflare','pending'),('martinfowler','pending'),('bytebytego','pending');
