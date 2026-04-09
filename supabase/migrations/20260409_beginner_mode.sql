ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS beginner_mode BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS generation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_id UUID NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  token_count INTEGER,
  repair_triggered BOOLEAN NOT NULL DEFAULT FALSE,
  recipe TEXT
);

CREATE INDEX IF NOT EXISTS idx_gen_events_workspace_member
  ON generation_events(workspace_id, member_id);

CREATE INDEX IF NOT EXISTS idx_gen_events_timestamp
  ON generation_events(workspace_id, timestamp DESC);

