-- Persist the claim before returning it so a lost HTTP response can be replayed.
CREATE TABLE spider_post_claims (
  request_id TEXT PRIMARY KEY NOT NULL,
  run_started_at TEXT NOT NULL,
  post_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX spider_post_claims_created_at ON spider_post_claims(created_at);
