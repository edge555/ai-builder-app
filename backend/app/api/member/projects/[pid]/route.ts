/**
 * GET /api/member/projects/:pid  — load project files
 * PUT /api/member/projects/:pid  — save project files (auto-save on generation complete)
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, createServiceRoleSupabaseClient } from '../../../../../lib/security/auth';
import { applyRateLimit, RateLimitTier } from '../../../../../lib/security';
import { handleOptions, getCorsHeaders, parseJsonRequest } from '../../../../../lib/api';
import { createLogger } from '../../../../../lib/logger';

const logger = createLogger('api/member/projects/[pid]');

const SaveProjectSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    // files as Record<string, { code: string }> — validated loosely to avoid over-constraining
    files_json: z.record(z.string(), z.object({ code: z.string() })).optional(),
});

async function verifyProjectOwnership(
    supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
    projectId: string,
    userId: string
): Promise<{ memberId: string } | null> {
    const { data } = await supabase!
        .from('workspace_projects')
        .select('id, member_id, members!inner(user_id)')
        .eq('id', projectId)
        .eq('members.user_id', userId)
        .maybeSingle();

    if (!data) return null;
    return { memberId: (data as { member_id: string }).member_id };
}

export async function OPTIONS() {
    return handleOptions();
}

export async function GET(request: NextRequest, { params }: { params: { pid: string } }) {
    const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.LOW_COST);
    if (blocked) return blocked;

    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;

    const supabase = createServiceRoleSupabaseClient();
    if (!supabase) return new Response(JSON.stringify({ error: 'Supabase not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });

    const ownership = await verifyProjectOwnership(supabase, params.pid, authResult.userId);
    if (!ownership) {
        return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const { data: project, error } = await supabase
        .from('workspace_projects')
        .select('id, name, files_json, created_at, updated_at')
        .eq('id', params.pid)
        .single();

    if (error || !project) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    return new Response(JSON.stringify(project), {
        headers: { ...getCorsHeaders(request), ...rlHeaders, 'Content-Type': 'application/json' },
    });
}

export async function PUT(request: NextRequest, { params }: { params: { pid: string } }) {
    const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.LOW_COST);
    if (blocked) return blocked;

    getCorsHeaders(request, { rejectInvalidOrigin: true });

    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;

    const parsed = await parseJsonRequest(request, SaveProjectSchema);
    if (!parsed.ok) return parsed.response;

    const supabase = createServiceRoleSupabaseClient();
    if (!supabase) return new Response(JSON.stringify({ error: 'Supabase not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });

    const ownership = await verifyProjectOwnership(supabase, params.pid, authResult.userId);
    if (!ownership) {
        return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.files_json !== undefined) updates.files_json = parsed.data.files_json;

    const { data: project, error } = await supabase
        .from('workspace_projects')
        .update(updates)
        .eq('id', params.pid)
        .select('id, name, updated_at')
        .single();

    if (error) {
        logger.error('Failed to save project', { error: error.message, projectId: params.pid });
        return new Response(JSON.stringify({ error: 'Failed to save project' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify(project), {
        headers: { ...getCorsHeaders(request), ...rlHeaders, 'Content-Type': 'application/json' },
    });
}
