/**
 * GET   /api/org/:orgId/workspaces/:wid  — workspace detail (admin only)
 * PATCH /api/org/:orgId/workspaces/:wid  — update workspace (admin only)
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, createServiceRoleSupabaseClient } from '../../../../../../lib/security/auth';
import { applyRateLimit, RateLimitTier } from '../../../../../../lib/security';
import { handleOptions, getCorsHeaders, corsError, parseJsonRequest } from '../../../../../../lib/api';

const UpdateWorkspaceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  beginner_mode: z.boolean().optional(),
}).refine((value) => value.name !== undefined || value.beginner_mode !== undefined, {
  message: 'At least one field is required',
});

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

  const { data: workspace, error } = await supabase
    .from('workspaces')
    .select('id, name, beginner_mode, created_at, org_id')
    .eq('id', wid)
    .maybeSingle();

  if (error) return corsError(request, 'Failed to fetch workspace', 500);
  if (!workspace) return corsError(request, 'Workspace not found', 404);
  if (workspace.org_id !== orgId) return corsError(request, 'Forbidden', 403);

  return new Response(JSON.stringify({
    id: workspace.id,
    name: workspace.name,
    beginner_mode: workspace.beginner_mode ?? false,
    created_at: workspace.created_at,
  }), {
    headers: { ...getCorsHeaders(request), ...rlHeaders, 'Content-Type': 'application/json' },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; wid: string }> }
) {
  const { orgId, wid } = await params;
  const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.LOW_COST);
  if (blocked) return blocked;

  getCorsHeaders(request, { rejectInvalidOrigin: true });

  const authResult = await requireAuth(request);
  if (authResult instanceof Response) return authResult;

  const parsed = await parseJsonRequest(request, UpdateWorkspaceSchema);
  if (!parsed.ok) return parsed.response;

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) return corsError(request, 'Supabase not configured', 503);

  if (!await verifyOrgAdmin(supabase, orgId, authResult.userId)) {
    return corsError(request, 'Forbidden', 403);
  }

  const { data: existingWorkspace, error: fetchError } = await supabase
    .from('workspaces')
    .select('id, org_id')
    .eq('id', wid)
    .maybeSingle();

  if (fetchError) return corsError(request, 'Failed to fetch workspace', 500);
  if (!existingWorkspace) return corsError(request, 'Workspace not found', 404);
  if (existingWorkspace.org_id !== orgId) return corsError(request, 'Forbidden', 403);

  const updates: { name?: string; beginner_mode?: boolean } = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.beginner_mode !== undefined) updates.beginner_mode = parsed.data.beginner_mode;

  const { data: workspace, error: updateError } = await supabase
    .from('workspaces')
    .update(updates)
    .eq('id', wid)
    .select('id, name, beginner_mode, created_at')
    .single();

  if (updateError) return corsError(request, 'Failed to update workspace', 500);

  return new Response(JSON.stringify(workspace), {
    headers: { ...getCorsHeaders(request), ...rlHeaders, 'Content-Type': 'application/json' },
  });
}

