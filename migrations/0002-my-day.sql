CREATE TABLE IF NOT EXISTS task_focus(
 owner_id TEXT NOT NULL, task_id TEXT NOT NULL REFERENCES tasks(id),
 selected INTEGER NOT NULL CHECK(selected IN(0,1)),
 PRIMARY KEY(owner_id,task_id)
);
