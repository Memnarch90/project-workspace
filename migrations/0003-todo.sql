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
