-- LangGraph checkpoint persistence for D1
CREATE TABLE IF NOT EXISTS checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  checkpoint TEXT NOT NULL,
  metadata TEXT NOT NULL,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

CREATE TABLE IF NOT EXISTS checkpoint_writes (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  channel TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_thread ON checkpoints (thread_id, checkpoint_ns);
CREATE INDEX IF NOT EXISTS idx_checkpoint_writes_thread ON checkpoint_writes (thread_id, checkpoint_ns, checkpoint_id);
