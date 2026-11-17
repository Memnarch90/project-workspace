CREATE TABLE IF NOT EXISTS browser_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
