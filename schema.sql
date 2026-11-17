PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY);
INSERT OR IGNORE INTO schema_version VALUES(1);
CREATE TABLE IF NOT EXISTS projects(
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Active'
 CHECK(status IN ('Active','On Hold','Completed')), version INTEGER NOT NULL DEFAULT 1,
 UNIQUE(owner_id,name)
);
CREATE TABLE IF NOT EXISTS workstreams(
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
 name TEXT NOT NULL, UNIQUE(project_id,name)
);
CREATE TABLE IF NOT EXISTS project_information(
 owner_id TEXT NOT NULL,
 id TEXT NOT NULL REFERENCES projects(id),
 body TEXT NOT NULL CHECK(json_valid(body) AND json_type(body)='object'),
 PRIMARY KEY(owner_id,id)
);
CREATE TABLE IF NOT EXISTS tasks(
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, project_id TEXT REFERENCES projects(id),
 workstream_id TEXT REFERENCES workstreams(id), title TEXT NOT NULL CHECK(length(trim(title))>0),
 item_type TEXT NOT NULL DEFAULT 'Task' CHECK(item_type IN ('Task','Milestone')),
 action_status TEXT NOT NULL CHECK(action_status IN ('Not Started','In Progress','Waiting','Blocked','Completed')),
 done INTEGER NOT NULL CHECK(done IN (0,1)), previous_action_status TEXT NOT NULL DEFAULT 'Not Started',
 priority TEXT NOT NULL DEFAULT '' CHECK(priority IN ('','High','Medium','Low')),
 due_date TEXT, follow_up_date TEXT, start_date TEXT, created_on TEXT, completed_on TEXT,
 waiting_on TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 assignee TEXT NOT NULL DEFAULT '', department TEXT NOT NULL DEFAULT '',
 milestone_id TEXT REFERENCES tasks(id), version INTEGER NOT NULL DEFAULT 1,
 review_flags TEXT NOT NULL DEFAULT '[]', archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN(0,1)),
 updated_at TEXT NOT NULL, UNIQUE(owner_id,id)
);
CREATE INDEX IF NOT EXISTS task_project_status ON tasks(owner_id,project_id,action_status,id);
CREATE INDEX IF NOT EXISTS task_due ON tasks(owner_id,done,due_date,id);
CREATE INDEX IF NOT EXISTS task_follow_up ON tasks(owner_id,done,follow_up_date,id);
CREATE TABLE IF NOT EXISTS task_focus(
 owner_id TEXT NOT NULL, task_id TEXT NOT NULL REFERENCES tasks(id),
 selected INTEGER NOT NULL CHECK(selected IN(0,1)),
 PRIMARY KEY(owner_id,task_id)
);
CREATE TABLE IF NOT EXISTS dependencies(
 task_id TEXT NOT NULL REFERENCES tasks(id), prerequisite_id TEXT NOT NULL REFERENCES tasks(id),
 PRIMARY KEY(task_id,prerequisite_id), CHECK(task_id<>prerequisite_id)
);
CREATE TABLE IF NOT EXISTS source_files(
 sha256 TEXT PRIMARY KEY, filename TEXT NOT NULL, imported_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS source_records(
 source_sha256 TEXT NOT NULL REFERENCES source_files(sha256), sheet TEXT NOT NULL, row_number INTEGER NOT NULL,
 task_id TEXT REFERENCES tasks(id), raw_json TEXT NOT NULL, disposition TEXT NOT NULL,
 PRIMARY KEY(source_sha256,sheet,row_number)
);
CREATE TABLE IF NOT EXISTS operations(
 owner_id TEXT NOT NULL, operation_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
 result_json TEXT NOT NULL, PRIMARY KEY(owner_id,operation_id)
);
CREATE TABLE IF NOT EXISTS audit_events(
 seq INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT NOT NULL, entity_type TEXT NOT NULL,
 entity_id TEXT NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL,
 before_json TEXT, after_json TEXT NOT NULL, operation_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_owner_cursor ON audit_events(owner_id,seq);
CREATE TRIGGER IF NOT EXISTS task_stream_project_insert BEFORE INSERT ON tasks
WHEN NEW.workstream_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM workstreams w WHERE w.id=NEW.workstream_id AND w.project_id=NEW.project_id)
BEGIN SELECT RAISE(ABORT,'Workstream does not belong to this project'); END;
CREATE TRIGGER IF NOT EXISTS dependency_valid BEFORE INSERT ON dependencies
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM tasks a JOIN tasks b ON a.project_id=b.project_id AND a.owner_id=b.owner_id WHERE a.id=NEW.task_id AND b.id=NEW.prerequisite_id)
 THEN RAISE(ABORT,'Dependency must remain in one project and owner') END;
 SELECT CASE WHEN EXISTS(WITH RECURSIVE chain(id) AS (
 SELECT prerequisite_id FROM dependencies WHERE task_id=NEW.prerequisite_id
 UNION SELECT d.prerequisite_id FROM dependencies d JOIN chain c ON d.task_id=c.id)
 SELECT id FROM chain WHERE id=NEW.task_id)
 THEN RAISE(ABORT,'Dependency cycle') END;
END;
CREATE TRIGGER IF NOT EXISTS task_stream_project_update BEFORE UPDATE ON tasks
WHEN NEW.workstream_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM workstreams w WHERE w.id=NEW.workstream_id AND w.project_id=NEW.project_id)
BEGIN SELECT RAISE(ABORT,'Workstream does not belong to this project'); END;

CREATE TABLE IF NOT EXISTS todo_items(
 task_id TEXT PRIMARY KEY REFERENCES tasks(id), owner_id TEXT NOT NULL,
 is_general INTEGER NOT NULL DEFAULT 1 CHECK(is_general IN(0,1)),
 frequency TEXT NOT NULL DEFAULT 'none' CHECK(frequency IN('none','daily','weekly','monthly')),
 interval_count INTEGER NOT NULL DEFAULT 1 CHECK(interval_count BETWEEN 1 AND 365),
 basis TEXT NOT NULL DEFAULT 'scheduled' CHECK(basis IN('scheduled','completed')),
 anchor_day INTEGER NOT NULL DEFAULT 1, scheduled_date TEXT,
 next_task_id TEXT REFERENCES tasks(id)
);
CREATE INDEX IF NOT EXISTS todo_owner ON todo_items(owner_id,is_general,task_id);

CREATE TABLE IF NOT EXISTS workspace_documents(
 owner_id TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN('task','template')),
 version INTEGER NOT NULL DEFAULT 1, body TEXT NOT NULL, PRIMARY KEY(owner_id,id)
);
CREATE TABLE IF NOT EXISTS workspace_recovery(
 owner_id TEXT NOT NULL, id TEXT NOT NULL, created_at TEXT NOT NULL, snapshot TEXT NOT NULL,
 PRIMARY KEY(owner_id,id)
);

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

CREATE TABLE IF NOT EXISTS note_blobs(owner_id TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),PRIMARY KEY(owner_id,id));
CREATE TABLE IF NOT EXISTS note_images(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,page_id TEXT NOT NULL REFERENCES note_pages(id),mime TEXT NOT NULL,data TEXT NOT NULL,alt TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS note_image_owner ON note_images(owner_id,page_id,id);
CREATE TABLE IF NOT EXISTS note_meetings(id TEXT NOT NULL,owner_id TEXT NOT NULL,page_id TEXT NOT NULL REFERENCES note_pages(id),block_index INTEGER NOT NULL,topic TEXT NOT NULL,meeting_when TEXT NOT NULL,participants TEXT NOT NULL,project_id TEXT,workstream_id TEXT,plain_text TEXT NOT NULL,text_refs TEXT NOT NULL DEFAULT '[]',project_refs TEXT NOT NULL DEFAULT '[]',PRIMARY KEY(owner_id,id));
CREATE INDEX IF NOT EXISTS meeting_owner_date ON note_meetings(owner_id,meeting_when,id);
CREATE TABLE IF NOT EXISTS note_layout(owner_id TEXT NOT NULL,id TEXT NOT NULL,color TEXT NOT NULL DEFAULT '',rank REAL NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(owner_id,id));

CREATE TABLE IF NOT EXISTS browser_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_proposals (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  article_id TEXT NOT NULL,
  expected_version INTEGER NOT NULL,
  content TEXT NOT NULL,
  reason TEXT NOT NULL,
  proposed_by TEXT NOT NULL,
  proposed_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  decided_by TEXT,
  decided_at TEXT,
  PRIMARY KEY(owner_id,id)
);
CREATE INDEX IF NOT EXISTS knowledge_proposal_queue ON knowledge_proposals(owner_id,status,proposed_at DESC,id);
CREATE TABLE IF NOT EXISTS knowledge_revisions (
  owner_id TEXT NOT NULL,
  article_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  proposal_id TEXT NOT NULL,
  PRIMARY KEY(owner_id,article_id,version),
  UNIQUE(owner_id,proposal_id),
  FOREIGN KEY(owner_id,proposal_id) REFERENCES knowledge_proposals(owner_id,id)
);
CREATE VIEW IF NOT EXISTS knowledge_current AS
  SELECT r.owner_id,r.article_id,r.version,r.proposal_id,p.content,p.decided_at
  FROM knowledge_revisions r
  JOIN knowledge_proposals p ON p.owner_id=r.owner_id AND p.id=r.proposal_id
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_revisions n
    WHERE n.owner_id=r.owner_id AND n.article_id=r.article_id AND n.version>r.version);


CREATE TABLE IF NOT EXISTS people(
 owner_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL CHECK(length(trim(name))>0),
 role TEXT NOT NULL, organisation TEXT NOT NULL,
 type TEXT NOT NULL CHECK(type IN ('Internal','External')),
 relationship TEXT NOT NULL CHECK(relationship IN ('Manager','Peer','Data owner','Sponsor','Supplier','Union','Network contact','Other')),
 influence TEXT NOT NULL CHECK(influence IN ('High','Medium','Low')),
 closeness TEXT NOT NULL CHECK(closeness IN ('High','Medium','Low')),
 project_ids TEXT NOT NULL CHECK(json_valid(project_ids) AND json_type(project_ids)='array'),
 next_touchpoint_date TEXT, keep_warm_weeks INTEGER CHECK(keep_warm_weeks BETWEEN 1 AND 520),
 notes TEXT NOT NULL, archived INTEGER NOT NULL CHECK(archived IN (0,1)),
 version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,id)
);
CREATE TABLE IF NOT EXISTS people_interactions(
 owner_id TEXT NOT NULL, id TEXT NOT NULL, person_id TEXT NOT NULL, date TEXT NOT NULL,
 channel TEXT NOT NULL CHECK(channel IN ('Teams','Email','Meeting','Call','In person','Other')),
 summary TEXT NOT NULL CHECK(length(trim(summary))>0),
 i_owe_them TEXT NOT NULL, they_owe_me TEXT NOT NULL,
 project_id TEXT REFERENCES projects(id), task_id TEXT, meeting_id TEXT,
 archived INTEGER NOT NULL CHECK(archived IN (0,1)), version INTEGER NOT NULL,
 PRIMARY KEY(owner_id,id),
 FOREIGN KEY(owner_id,person_id) REFERENCES people(owner_id,id),
 FOREIGN KEY(owner_id,task_id) REFERENCES tasks(owner_id,id)
);
CREATE INDEX IF NOT EXISTS people_interaction_timeline ON people_interactions(owner_id,person_id,archived,date,id);
CREATE TABLE IF NOT EXISTS task_people(
 owner_id TEXT NOT NULL, task_id TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('waiting_on','assignee')),
 person_id TEXT NOT NULL, PRIMARY KEY(owner_id,task_id,role),
 FOREIGN KEY(owner_id,task_id) REFERENCES tasks(owner_id,id),
 FOREIGN KEY(owner_id,person_id) REFERENCES people(owner_id,id)
);
CREATE INDEX IF NOT EXISTS people_linked_tasks ON task_people(owner_id,person_id,task_id);
CREATE TRIGGER IF NOT EXISTS task_people_active BEFORE INSERT ON task_people
WHEN NOT EXISTS(SELECT 1 FROM people WHERE owner_id=NEW.owner_id AND id=NEW.person_id AND archived=0)
BEGIN SELECT RAISE(ABORT,'Choose an active person'); END;
CREATE TRIGGER IF NOT EXISTS people_interaction_active BEFORE INSERT ON people_interactions
WHEN NOT EXISTS(SELECT 1 FROM people WHERE owner_id=NEW.owner_id AND id=NEW.person_id AND archived=0)
BEGIN SELECT RAISE(ABORT,'Choose an active person'); END;
CREATE TABLE IF NOT EXISTS meeting_people(
 owner_id TEXT NOT NULL, meeting_id TEXT NOT NULL, participant TEXT NOT NULL,
 person_id TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY(owner_id,meeting_id,participant),
 FOREIGN KEY(owner_id,person_id) REFERENCES people(owner_id,id)
);
