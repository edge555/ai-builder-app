-- Atomic turn_count increment for project_sessions.
-- Called by appendTurn() in session-service.ts via supabase.rpc().
-- Replaces the prior read-modify-write (SELECT + UPDATE) with a single atomic UPDATE.
CREATE OR REPLACE FUNCTION public.increment_session_turn_count(session_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.project_sessions
  SET turn_count     = turn_count + 1,
      last_active_at = now()
  WHERE id = session_id;
$$;
