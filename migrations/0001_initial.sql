CREATE TABLE items (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK(source IN ('geeknews','x','youtube')),
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
  UNIQUE(source, external_id)
);
CREATE INDEX items_source_date ON items(source, sort_at DESC, id DESC);
CREATE INDEX items_date ON items(sort_at DESC, id DESC);
CREATE INDEX items_canonical ON items(canonical_url);
CREATE TABLE source_state (
  source TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  last_attempt_at TEXT,
  last_success_at TEXT,
  error_code TEXT,
  lock_until TEXT,
  lock_owner TEXT
);
INSERT INTO source_state(source,status) VALUES ('geeknews','pending'),('x','not_configured'),('youtube','not_configured');
CREATE TABLE ingestion_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  fetched INTEGER NOT NULL DEFAULT 0,
  stored INTEGER NOT NULL DEFAULT 0,
  error_code TEXT
);
CREATE INDEX runs_date ON ingestion_runs(started_at);
CREATE TABLE usage_budget (
  source TEXT NOT NULL,
  period TEXT NOT NULL,
  reserved INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(source, period)
);
