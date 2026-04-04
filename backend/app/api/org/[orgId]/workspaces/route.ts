/**
 * GET  /api/org/:orgId/workspaces  — list workspaces (admin only)
 * POST /api/org/:orgId/workspaces  — create workspace (admin only)
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, createServiceRoleSupabaseClient } from '../../../../../lib/security/auth';
import { applyRateLimit, RateLimitTier } from '../../../../../lib/security';
import { handleOptions, getCorsHeaders, corsError, parseJsonRequest } from '../../../../../lib/api';
import { createLogger } from '../../../../../lib/logger';

const logger = createLogger('api/org/workspaces');

const CreateWorkspaceSchema = z.object({
    name: z.string().min(1).max(200),
});

async function verifyOrgAdmin(supabase: ReturnType<typeof createServiceRoleSupabaseClient>, orgId: string, userId: string): Promise<boolean> {
    const { data } = await supabase!.from('organizations').select('id').eq('id', orgId).eq('admin_user_id', userId).maybeSingle();
    return !!data;
}

export async function OPTIONS() {
    return handleOptions();
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
    const { orgId } = await params;
    const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.LOW_COST);
    if (blocked) return blocked;

    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;

    const supabase = createServiceRoleSupabaseClient();
    if (!supabase) return corsError(request, 'Supabase not configured', 503);

    if (!await verifyOrgAdmin(supabase, orgId, authResult.userId)) {
        return corsError(request, 'Forbidden', 403);
    }

    const { data: workspaces, error } = await supabase
        .from('workspaces')
        .select('id, name, created_at')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

    if (error) {
        return corsError(request, 'Failed to fetch workspaces', 500);
    }

    return new Response(JSON.stringify(workspaces), {
        headers: { ...getCorsHeaders(request), ...rlHeaders, 'Content-Type': 'application/json' },
    });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
    const { orgId } = await params;
    const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.LOW_COST);
    if (blocked) return blocked;

    getCorsHeaders(request, { rejectInvalidOrigin: true });

    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;

    const parsed = await parseJsonRequest(request, CreateWorkspaceSchema);
    if (!parsed.ok) return parsed.response;

    const supabase = createServiceRoleSupabaseClient();
    if (!supabase) return corsError(request, 'Supabase not configured', 503);

    if (!await verifyOrgAdmin(supabase, orgId, authResult.userId)) {
        return corsError(request, 'Forbidden', 403);
    }

    const { data: workspace, error } = await supabase
        .from('workspaces')
        .insert({ org_id: orgId, name: parsed.data.name })
        .select('id, name, created_at')
        .single();

    if (error) {
        logger.error('Failed to create workspace', { error: error.message });
        return corsError(request, 'Failed to create workspace', 500);
    }

    return new Response(JSON.stringify(workspace), {
        status: 201,
        headers: { ...getCorsHeaders(request), ...rlHeaders, 'Content-Type': 'application/json' },
    });
}
