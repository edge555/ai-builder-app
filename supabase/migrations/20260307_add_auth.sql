-- Add user ownership to projects
ALTER TABLE public.projects
  ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX idx_projects_user_id ON public.projects(user_id);

-- Add user ownership to versions
ALTER TABLE public.versions
  ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Chat messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_summary JSONB,
  diffs JSONB,
  is_error BOOLEAN DEFAULT false
);

CREATE INDEX idx_chat_messages_project ON public.chat_messages(project_id, created_at ASC);

-- Drop old public policies on projects
DROP POLICY IF EXISTS "Public can read projects" ON public.projects;
DROP POLICY IF EXISTS "Public can create projects" ON public.projects;
DROP POLICY IF EXISTS "Public can update projects" ON public.projects;
DROP POLICY IF EXISTS "Public can delete projects" ON public.projects;

-- Drop old public policies on versions
DROP POLICY IF EXISTS "Public can read versions" ON public.versions;
DROP POLICY IF EXISTS "Public can create versions" ON public.versions;
DROP POLICY IF EXISTS "Public can update versions" ON public.versions;
DROP POLICY IF EXISTS "Public can delete versions" ON public.versions;

-- User-scoped RLS policies for projects
CREATE POLICY "Users read own projects" ON public.projects
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own projects" ON public.projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own projects" ON public.projects
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own projects" ON public.projects
  FOR DELETE USING (auth.uid() = user_id);

-- User-scoped RLS policies for versions
CREATE POLICY "Users read own versions" ON public.versions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own versions" ON public.versions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS for chat_messages
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own chat" ON public.chat_messages
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own chat" ON public.chat_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);
