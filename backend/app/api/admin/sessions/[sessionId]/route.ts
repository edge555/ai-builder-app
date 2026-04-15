import { NextRequest } from 'next/server';
import { applyRateLimit, RateLimitTier } from '../../../../../lib/security';
import { createServiceRoleSupabaseClient, requireAuth } from '../../../../../lib/security/auth';
import { corsError, getCorsHeaders, handleOptions } from '../../../../../lib/api';

interface SessionRow {
  id: string;
  workspace_id: string;
  member_id: string;
  project_id: string;
  turn_count: number;
  last_active_at: string;
  created_at: string;
}

interface MessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  files_affected: unknown;
  repair_triggered: boolean;
  repair_explanation: string | null;
  created_at: string;
}

function normalizeFilesAffected(value: unknown): string[] | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === 'string');
      }
    } catch {
      return null;
    }
  }
  return null;
}

async function verifyWorkspaceAdmin(
  supabase: NonNullable<ReturnType<typeof createServiceRoleSupabaseClient>>,
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('org_id')
    .eq('id', workspaceId)
    .maybeSingle<{ org_id: string }>();

  if (!workspace) return false;

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('id', workspace.org_id)
    .eq('admin_user_id', userId)
    .maybeSingle<{ id: string }>();

  return !!org;
}

export async function OPTIONS() {
  return handleOptions();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.LOW_COST);
  if (blocked) return blocked;

  const authResult = await requireAuth(request);
  if (authResult instanceof Response) return authResult;

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) return corsError(request, 'Supabase not configured', 503);

  const { data: session, error: sessionError } = await supabase
    .from('project_sessions')
    .select('id, workspace_id, member_id, project_id, turn_count, last_active_at, created_at')
    .eq('id', sessionId)
    .maybeSingle<SessionRow>();

  if (sessionError) return corsError(request, 'Failed to fetch session', 500);
  if (!session) return corsError(request, 'Session not found', 404);

  const isAdmin = await verifyWorkspaceAdmin(supabase, session.workspace_id, authResult.userId);
  if (!isAdmin) return corsError(request, 'Forbidden', 403);

  const [memberRes, projectRes, messagesRes] = await Promise.all([
    supabase
      .from('members')
      .select('display_name')
      .eq('id', session.member_id)
      .maybeSingle<{ display_name: string | null }>(),
    supabase
      .from('workspace_projects')
      .select('name')
      .eq('id', session.project_id)
      .maybeSingle<{ name: string | null }>(),
    supabase
      .from('session_messages')
      .select('id, role, content, files_affected, repair_triggered, repair_explanation, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(500),
  ]);

  if (memberRes.error || projectRes.error || messagesRes.error) {
    return corsError(request, 'Failed to load transcript', 500);
  }

  const sessionSummary = {
    id: session.id,
    member_id: session.member_id,
    member_name: memberRes.data?.display_name ?? 'Unknown Member',
    project_id: session.project_id,
    project_name: projectRes.data?.name ?? 'Untitled Project',
    turn_count: session.turn_count ?? 0,
    last_active_at: session.last_active_at,
    created_at: session.created_at,
  };

  const messages = ((messagesRes.data ?? []) as MessageRow[]).map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    files_affected: normalizeFilesAffected(row.files_affected),
    repair_triggered: row.repair_triggered ?? false,
    repair_explanation: row.repair_explanation,
    created_at: row.created_at,
  }));

  return new Response(JSON.stringify({ session: sessionSummary, messages }), {
    headers: { ...getCorsHeaders(request), ...rlHeaders, 'Content-Type': 'application/json' },
  });
}

