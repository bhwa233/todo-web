CREATE TABLE spider_runs (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('producer', 'consumer')),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'partial', 'bounded', 'failed', 'interrupted')),
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  lease_expires_at TEXT NOT NULL,
  credential_version TEXT,
  login_status TEXT NOT NULL DEFAULT 'pending' CHECK (login_status IN ('pending', 'verified', 'rejected')),
  summary_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  github_run_id TEXT,
  github_run_attempt INTEGER
);
CREATE INDEX spider_runs_started_at ON spider_runs(started_at DESC, id DESC);
CREATE INDEX spider_runs_credential_version ON spider_runs(credential_version, updated_at DESC);
