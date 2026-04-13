/**
 * GET /api/org/:orgId/workspaces/:wid/metrics — per-member generation metrics (admin only)
 */

import { NextRequest } from 'next/server';
import { requireAuth, createServiceRoleSupabaseClient } from '../../../../../../../lib/security/auth';
import { applyRateLimit, RateLimitTier } from '../../../../../../../lib/security';
import { handleOptions, getCorsHeaders, corsError } from '../../../../../../../lib/api';

interface GenerationEventRow {
  member_id: string;
  timestamp: string;
  repair_triggered: boolean;
}

interface WorkspaceRecord {
  org_id: string;
}

async function verifyOrgAdmin(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  orgId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase!
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .eq('admin_user_id', userId)
    .maybeSingle();
  return !!data;
}

export async function OPTIONS() {
  return handleOptions();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; wid: string }> }
) {
  const { orgId, wid } = await params;
  const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.LOW_COST);
  if (blocked) return blocked;

  const authResult = await requireAuth(request);
  if (authResult instanceof Response) return authResult;

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) return corsError(request, 'Supabase not configured', 503);

  if (!await verifyOrgAdmin(supabase, orgId, authResult.userId)) {
    return corsError(request, 'Forbidden', 403);
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .select('org_id')
    .eq('id', wid)
    .maybeSingle<WorkspaceRecord>();

  if (workspaceError) return corsError(request, 'Failed to fetch workspace', 500);
  if (!workspace) return corsError(request, 'Workspace not found', 404);
  if (workspace.org_id !== orgId) return corsError(request, 'Forbidden', 403);

  const { data: events, error: eventsError } = await supabase
    .from('generation_events')
    .select('member_id, timestamp, repair_triggered')
    .eq('workspace_id', wid)
    .order('timestamp', { ascending: false });

  if (eventsError) return corsError(request, 'Failed to fetch metrics', 500);

  const rows = (events ?? []) as GenerationEventRow[];
  if (rows.length === 0) {
    return new Response(JSON.stringify([]), {
      headers: { ...getCorsHeaders(request), ...rlHeaders, 'Content-Type': 'application/json' },
    });
  }

  const byMember = new Map<string, {
    memberId: string;
    totalGenerations: number;
    repairCount: number;
    lastActive: string;
  }>();

  for (const row of rows) {
    const existing = byMember.get(row.member_id);
    if (!existing) {
      byMember.set(row.member_id, {
        memberId: row.member_id,
        totalGenerations: 1,
        repairCount: row.repair_triggered ? 1 : 0,
        lastActive: row.timestamp,
      });
      continue;
    }

    existing.totalGenerations += 1;
    if (row.repair_triggered) existing.repairCount += 1;
    if (row.timestamp > existing.lastActive) existing.lastActive = row.timestamp;
  }

  const result = Array.from(byMember.values()).sort((a, b) =>
    b.lastActive.localeCompare(a.lastActive)
  );

  return new Response(JSON.stringify(result), {
    headers: { ...getCorsHeaders(request), ...rlHeaders, 'Content-Type': 'application/json' },
  });
}

