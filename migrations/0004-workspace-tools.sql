
CREATE TABLE IF NOT EXISTS workspace_documents(
 owner_id TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN('task','template')),
 version INTEGER NOT NULL DEFAULT 1, body TEXT NOT NULL, PRIMARY KEY(owner_id,id)
);
CREATE TABLE IF NOT EXISTS workspace_recovery(
 owner_id TEXT NOT NULL, id TEXT NOT NULL, created_at TEXT NOT NULL, snapshot TEXT NOT NULL,
 PRIMARY KEY(owner_id,id)
);
