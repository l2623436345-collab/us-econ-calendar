CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT '随笔',
  summary TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_articles_published_updated ON articles(published, updated_at);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
