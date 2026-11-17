CREATE TABLE IF NOT EXISTS note_folders(
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN('notebook','section')),
 parent_id TEXT REFERENCES note_folders(id),title TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN(0,1)),
 version INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS note_folder_owner ON note_folders(owner_id,parent_id,id);
CREATE TABLE IF NOT EXISTS note_pages(
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,section_id TEXT NOT NULL REFERENCES note_folders(id),title TEXT NOT NULL,
 doc_json TEXT NOT NULL,plain_text TEXT NOT NULL,project_id TEXT REFERENCES projects(id),workstream_id TEXT REFERENCES workstreams(id),
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN(0,1)),version INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS note_page_owner ON note_pages(owner_id,section_id,id);
CREATE TABLE IF NOT EXISTS note_revisions(
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,page_id TEXT NOT NULL REFERENCES note_pages(id),page_version INTEGER NOT NULL,
 snapshot TEXT NOT NULL,saved_at TEXT NOT NULL,reason TEXT NOT NULL,UNIQUE(owner_id,page_id,page_version)
);
CREATE INDEX IF NOT EXISTS note_revision_owner ON note_revisions(owner_id,page_id,saved_at);
