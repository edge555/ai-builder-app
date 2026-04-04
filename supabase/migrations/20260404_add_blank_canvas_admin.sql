-- =============================================================================
-- Blank Canvas Admin: Multi-tenant tables
-- Organizations, Workspaces, Members, Workspace Projects, Snapshots
-- =============================================================================

-- -----------------------------------------------------------------------------
-- organizations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  slug                 TEXT NOT NULL UNIQUE,
  admin_user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key_encrypted    TEXT,                    -- AES-256-GCM; NULL until admin saves a key
  api_key_key_version  INTEGER NOT NULL DEFAULT 1,  -- enables future key rotation
  label_workspace      TEXT NOT NULL DEFAULT 'Workspace',
  label_member         TEXT NOT NULL DEFAULT 'Member',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ              -- soft delete
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Only the org admin can read/write their own org
CREATE POLICY "org_admin_only" ON public.organizations
  FOR ALL USING (admin_user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- workspaces
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- Org admin can read/write all workspaces in their org
CREATE POLICY "workspace_admin" ON public.workspaces
  FOR ALL USING (
    org_id IN (
      SELECT id FROM public.organizations WHERE admin_user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- members
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.members (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- NULL until invite accepted
  email                    TEXT NOT NULL,
  display_name             TEXT NOT NULL DEFAULT '',
  joined_at                TIMESTAMPTZ,
  invite_token_hash        TEXT,        -- SHA-256 of invite JWT; cleared on accept
  invite_token_expires_at  TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

-- Org admin can read/write all members in their workspaces
CREATE POLICY "member_admin" ON public.members
  FOR ALL USING (
    workspace_id IN (
      SELECT w.id FROM public.workspaces w
      JOIN public.organizations o ON o.id = w.org_id
      WHERE o.admin_user_id = auth.uid()
    )
  );

-- Members can read their own row
CREATE POLICY "member_self_read" ON public.members
  FOR SELECT USING (user_id = auth.uid());

-- Members can read their own workspace (requires members table — defined here after it)
CREATE POLICY "workspace_member_read" ON public.workspaces
  FOR SELECT USING (
    id IN (
      SELECT workspace_id FROM public.members WHERE user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- workspace_projects
-- Separate from the existing public.projects table (single-user cloud storage).
-- These are workspace-member projects persisted to Supabase.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT 'Untitled Project',
  files_json   JSONB NOT NULL DEFAULT '{}',   -- Record<string, { code: string }>
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_projects ENABLE ROW LEVEL SECURITY;

-- Members can read/write their own projects
CREATE POLICY "wp_member_own" ON public.workspace_projects
  FOR ALL USING (
    member_id IN (
      SELECT id FROM public.members WHERE user_id = auth.uid()
    )
  );

-- Org admin can read all projects in their workspaces
CREATE POLICY "wp_admin_read" ON public.workspace_projects
  FOR SELECT USING (
    workspace_id IN (
      SELECT w.id FROM public.workspaces w
      JOIN public.organizations o ON o.id = w.org_id
      WHERE o.admin_user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- workspace_project_snapshots
-- Stores pre-generation file state for auto-repair rollback.
-- 1 snapshot per project in v1 (upsert on project_id).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_project_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.workspace_projects(id) ON DELETE CASCADE,
  files_json  JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforce 1-snapshot-per-project at the DB level
CREATE UNIQUE INDEX IF NOT EXISTS workspace_project_snapshots_project_id_key
  ON public.workspace_project_snapshots(project_id);

ALTER TABLE public.workspace_project_snapshots ENABLE ROW LEVEL SECURITY;

-- Members read/write their own snapshots (via project ownership)
CREATE POLICY "snap_member_own" ON public.workspace_project_snapshots
  FOR ALL USING (
    project_id IN (
      SELECT wp.id FROM public.workspace_projects wp
      JOIN public.members m ON m.id = wp.member_id
      WHERE m.user_id = auth.uid()
    )
  );

-- Org admin can read snapshots for their workspaces
CREATE POLICY "snap_admin_read" ON public.workspace_project_snapshots
  FOR SELECT USING (
    project_id IN (
      SELECT wp.id FROM public.workspace_projects wp
      JOIN public.workspaces w ON w.id = wp.workspace_id
      JOIN public.organizations o ON o.id = w.org_id
      WHERE o.admin_user_id = auth.uid()
    )
  );

-- =============================================================================
-- Indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_members_user_id
  ON public.members(user_id);

CREATE INDEX IF NOT EXISTS idx_members_workspace_id
  ON public.members(workspace_id);

CREATE INDEX IF NOT EXISTS idx_members_invite_token_hash
  ON public.members(invite_token_hash)
  WHERE invite_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workspaces_org_id
  ON public.workspaces(org_id);

CREATE INDEX IF NOT EXISTS idx_workspace_projects_member_id
  ON public.workspace_projects(member_id);

CREATE INDEX IF NOT EXISTS idx_workspace_projects_workspace_id
  ON public.workspace_projects(workspace_id);
