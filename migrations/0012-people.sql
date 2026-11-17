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
