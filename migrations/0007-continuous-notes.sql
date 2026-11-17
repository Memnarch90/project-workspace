CREATE TABLE IF NOT EXISTS note_blobs(owner_id TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),PRIMARY KEY(owner_id,id));
CREATE TABLE IF NOT EXISTS note_images(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,page_id TEXT NOT NULL REFERENCES note_pages(id),mime TEXT NOT NULL,data TEXT NOT NULL,alt TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS note_image_owner ON note_images(owner_id,page_id,id);
CREATE TABLE IF NOT EXISTS note_meetings(id TEXT NOT NULL,owner_id TEXT NOT NULL,page_id TEXT NOT NULL REFERENCES note_pages(id),block_index INTEGER NOT NULL,topic TEXT NOT NULL,meeting_when TEXT NOT NULL,participants TEXT NOT NULL,project_id TEXT,workstream_id TEXT,plain_text TEXT NOT NULL,text_refs TEXT NOT NULL DEFAULT '[]',project_refs TEXT NOT NULL DEFAULT '[]',PRIMARY KEY(owner_id,id));
CREATE INDEX IF NOT EXISTS meeting_owner_date ON note_meetings(owner_id,meeting_when,id);

INSERT OR IGNORE INTO note_meetings(id,owner_id,page_id,block_index,topic,meeting_when,participants,project_id,workstream_id,plain_text,text_refs,project_refs)
SELECT id,owner_id,id,0,json_extract(doc_json,'$.content[0].attrs.topic'),json_extract(doc_json,'$.content[0].attrs.when'),json_extract(doc_json,'$.content[0].attrs.participants'),project_id,workstream_id,plain_text,'[]','[]' FROM note_pages WHERE json_extract(doc_json,'$.content[0].type')='meetingMeta';
