CREATE TABLE "_AiJob" (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('task-tags','bookmark-summary')),
  targetId TEXT NOT NULL,
  expectedVersion TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PUBLISHED','RUNNING','DONE','SUPERSEDED','FAILED')),
  publishedAt INTEGER,
  leaseToken TEXT,
  leaseUntil INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX "_AiJob_outbox" ON "_AiJob"(status,publishedAt,leaseUntil);
CREATE INDEX "_AiJob_target" ON "_AiJob"(targetId,createdAt);
