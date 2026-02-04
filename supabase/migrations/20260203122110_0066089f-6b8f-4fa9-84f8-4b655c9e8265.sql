-- Create projects + versions tables for no-auth prototype

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  message TEXT NOT NULL DEFAULT '',
  project_state JSONB NOT NULL,
  change_summary JSONB,
  diffs JSONB
);

CREATE INDEX IF NOT EXISTS idx_versions_project_created_at
  ON public.versions(project_id, created_at DESC);

-- Timestamp trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_projects_set_updated_at ON public.projects;
CREATE TRIGGER trg_projects_set_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS (still recommended even for prototype)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.versions ENABLE ROW LEVEL SECURITY;

-- No-auth prototype policies: allow anyone (anon) to read/write
DO $$
BEGIN
  -- projects
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='projects' AND policyname='Public can read projects'
  ) THEN
    CREATE POLICY "Public can read projects" ON public.projects FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='projects' AND policyname='Public can create projects'
  ) THEN
    CREATE POLICY "Public can create projects" ON public.projects FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='projects' AND policyname='Public can update projects'
  ) THEN
    CREATE POLICY "Public can update projects" ON public.projects FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='projects' AND policyname='Public can delete projects'
  ) THEN
    CREATE POLICY "Public can delete projects" ON public.projects FOR DELETE USING (true);
  END IF;

  -- versions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='versions' AND policyname='Public can read versions'
  ) THEN
    CREATE POLICY "Public can read versions" ON public.versions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='versions' AND policyname='Public can create versions'
  ) THEN
    CREATE POLICY "Public can create versions" ON public.versions FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='versions' AND policyname='Public can update versions'
  ) THEN
    CREATE POLICY "Public can update versions" ON public.versions FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='versions' AND policyname='Public can delete versions'
  ) THEN
    CREATE POLICY "Public can delete versions" ON public.versions FOR DELETE USING (true);
  END IF;
END $$;