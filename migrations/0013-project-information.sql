CREATE TABLE IF NOT EXISTS project_information(
 owner_id TEXT NOT NULL,
 id TEXT NOT NULL REFERENCES projects(id),
 body TEXT NOT NULL CHECK(json_valid(body) AND json_type(body)='object'),
 PRIMARY KEY(owner_id,id)
);
