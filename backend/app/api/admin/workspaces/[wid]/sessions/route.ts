import { NextRequest } from 'next/server';
import { applyRateLimit, RateLimitTier } from '../../../../../../lib/security';
import { createServiceRoleSupabaseClient, requireAuth } from '../../../../../../lib/security/auth';
import { corsError, getCorsHeaders, handleOptions } from '../../../../../../lib/api';

const PAGE_SIZE = 25;

interface SessionRow {
  id: string;
  member_id: string;
  project_id: string;
  turn_count: number;
  last_active_at: string;
  created_at: string;
}

interface CursorPayload {
  created_at: string;
  id: string;
}

function encodeCursor(row: CursorPayload): string {
  return Buffer.from(JSON.stringify(row)).toString('base64url');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;

function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorPayload;
    if (
      !parsed.created_at || !parsed.id ||
      !ISO_DATE_RE.test(parsed.created_at) ||
      !UUID_RE.test(parsed.id)
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function verifyWorkspaceAdmin(
  supabase: NonNullable<ReturnType<typeof createServiceRoleSupabaseClient>>,
  workspaceId: string,
  userId: string
): Promise<'ok' | 'not_found' | 'forbidden'> {
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('org_id')
    .eq('id', workspaceId)
    .maybeSingle<{ org_id: string }>();

  if (!workspace) return 'not_found';

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('id', workspace.org_id)
    .eq('admin_user_id', userId)
    .maybeSingle<{ id: string }>();

  return org ? 'ok' : 'forbidden';
}


export async function OPTIONS() {
  return handleOptions();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wid: string }> }
) {
  const { wid } = await params;
  const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.LOW_COST);
  if (blocked) return blocked;

  const authResult = await requireAuth(request);
  if (authResult instanceof Response) return authResult;

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) return corsError(request, 'Supabase not configured', 503);

  const adminCheck = await verifyWorkspaceAdmin(supabase, wid, authResult.userId);
  if (adminCheck === 'not_found') return corsError(request, 'Workspace not found', 404);
  if (adminCheck === 'forbidden') return corsError(request, 'Forbidden', 403);

  const url = new URL(request.url);
  const cursorRaw = url.searchParams.get('cursor');
  const decodedCursor = cursorRaw ? decodeCursor(cursorRaw) : null;
  if (cursorRaw && !decodedCursor) return corsError(request, 'Invalid cursor', 400);

  let sessionQuery = supabase
    .from('project_sessions')
    .select('id, member_id, project_id, turn_count, last_active_at, created_at')
    .eq('workspace_id', wid)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (decodedCursor) {
    // Keyset pagination: rows where created_at < cursor OR (created_at = cursor AND id < cursor_id)
    sessionQuery = sessionQuery.or(
      `created_at.lt.${decodedCursor.created_at},and(created_at.eq.${decodedCursor.created_at},id.lt.${decodedCursor.id})`
    );
  }

  const { data: allRows, error } = await sessionQuery;
  if (error) return corsError(request, 'Failed to fetch sessions', 500);

  const rows = (allRows ?? []) as SessionRow[];
  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);

  const memberIds = Array.from(new Set(page.map((row) => row.member_id)));
  const projectIds = Array.from(new Set(page.map((row) => row.project_id)));

  const [membersRes, projectsRes] = await Promise.all([
    memberIds.length > 0
      ? supabase
          .from('members')
          .select('id, display_name')
          .eq('workspace_id', wid)
          .in('id', memberIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length > 0
      ? supabase
          .from('workspace_projects')
          .select('id, name')
          .eq('workspace_id', wid)
          .in('id', projectIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (membersRes.error || projectsRes.error) {
    return corsError(request, 'Failed to fetch session metadata', 500);
  }

  const memberNameById = new Map(
    (membersRes.data ?? []).map((m: { id: string; display_name: string | null }) => [m.id, m.display_name || 'Unknown Member'])
  );
  const projectNameById = new Map(
    (projectsRes.data ?? []).map((p: { id: string; name: string | null }) => [p.id, p.name || 'Untitled Project'])
  );

  const sessions = page.map((row) => ({
    id: row.id,
    member_id: row.member_id,
    member_name: memberNameById.get(row.member_id) ?? 'Unknown Member',
    project_id: row.project_id,
    project_name: projectNameById.get(row.project_id) ?? 'Untitled Project',
    turn_count: row.turn_count ?? 0,
    last_active_at: row.last_active_at,
    created_at: row.created_at,
  }));

  const nextCursor = hasMore && page.length > 0
    ? encodeCursor({
        created_at: page[page.length - 1].created_at,
        id: page[page.length - 1].id,
      })
    : undefined;

  return new Response(JSON.stringify({ sessions, ...(nextCursor ? { nextCursor } : {}) }), {
    headers: { ...getCorsHeaders(request), ...rlHeaders, 'Content-Type': 'application/json' },
  });
}

