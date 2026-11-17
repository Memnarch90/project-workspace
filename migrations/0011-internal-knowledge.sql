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
