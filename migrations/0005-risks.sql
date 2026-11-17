
CREATE TABLE IF NOT EXISTS risks(
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id),
 workstream_id TEXT REFERENCES workstreams(id), reference TEXT NOT NULL,
 date_raised TEXT NOT NULL, function TEXT NOT NULL DEFAULT '', assignee TEXT NOT NULL DEFAULT '',
 description TEXT NOT NULL CHECK(length(trim(description))>0), issue_date TEXT,
 likelihood INTEGER CHECK(likelihood BETWEEN 1 AND 6), impact INTEGER CHECK(impact BETWEEN 1 AND 6),
 mitigation TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN('Open','Closed')),
 comments TEXT NOT NULL DEFAULT '', reviewed_on TEXT, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN(0,1)),
 version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, UNIQUE(owner_id,reference)
);
CREATE INDEX IF NOT EXISTS risk_project_status ON risks(owner_id,project_id,status,id);
