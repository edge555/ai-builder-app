-- =============================================================================
-- Reliable Continuation: per-project append-only conversation sessions
-- =============================================================================

-- One active session per (workspace, project, member). Idle > 4h handled in app logic.
CREATE TABLE IF NOT EXISTS public.project_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id     UUID NOT NULL REFERENCES public.workspace_projects(id) ON DELETE CASCADE,
  member_id      UUID NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  turn_count     INT NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.session_messages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID NOT NULL REFERENCES public.project_sessions(id) ON DELETE CASCADE,
  role               TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content            TEXT NOT NULL,
  files_affected     JSONB,
  repair_triggered   BOOLEAN NOT NULL DEFAULT false,
  repair_explanation TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_sessions_one_active
  ON public.project_sessions (workspace_id, project_id, member_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_project_sessions_lookup
  ON public.project_sessions (workspace_id, project_id, member_id);

CREATE INDEX IF NOT EXISTS idx_session_messages_session_created
  ON public.session_messages (session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_session_messages_content_tsv
  ON public.session_messages USING gin(to_tsvector('english', content));

ALTER TABLE public.project_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_sessions_service_role_all" ON public.project_sessions
  FOR ALL TO service_role USING (true);

CREATE POLICY "project_sessions_member_read_workspace" ON public.project_sessions
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "session_messages_service_role_all" ON public.session_messages
  FOR ALL TO service_role USING (true);

CREATE POLICY "session_messages_member_read_workspace" ON public.session_messages
  FOR SELECT TO authenticated
  USING (
    session_id IN (
      SELECT ps.id
      FROM public.project_sessions ps
      WHERE ps.workspace_id IN (
        SELECT workspace_id FROM public.members WHERE user_id = auth.uid()
      )
    )
  );

