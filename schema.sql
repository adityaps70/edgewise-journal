-- Edgewise trading journal — Cloudflare D1 schema
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  plan TEXT DEFAULT 'free',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Every journal record (trade, account, payout, plan, journal entry, profile...) is one row.
CREATE TABLE IF NOT EXISTS docs (
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, id)
);

-- Chart screenshots attached to trades (compressed JPEG data URLs).
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_images_user ON images(user_id);

-- Per-user daily AI call counter (keeps your Claude bill predictable).
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- Mentor mode: read-only share links and the notes mentors leave on them.
CREATE TABLE IF NOT EXISTS shares (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, label TEXT, include_journal INTEGER DEFAULT 0, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_shares_user ON shares(user_id);
CREATE TABLE IF NOT EXISTS mentor_notes (id TEXT PRIMARY KEY, token TEXT NOT NULL, user_id TEXT NOT NULL, trade_id TEXT, author TEXT, text TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_notes_user ON mentor_notes(user_id);

-- Broker connections (API keys encrypted), add-on sync keys, add-on inbox, uploaded price bars.
CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, label TEXT, base_url TEXT, username TEXT, secret_enc TEXT, meta TEXT, last_sync INTEGER, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_conn_user ON connections(user_id);
CREATE TABLE IF NOT EXISTS ingest_keys (key TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ingest_user ON ingest_keys(user_id);
CREATE TABLE IF NOT EXISTS inbox (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, source TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_inbox_user ON inbox(user_id);
CREATE TABLE IF NOT EXISTS bars (user_id TEXT NOT NULL, symbol TEXT NOT NULL, day TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, symbol, day));
