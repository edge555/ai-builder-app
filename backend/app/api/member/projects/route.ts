/**
 * GET  /api/member/projects  — list projects for the authenticated member in a workspace
 * POST /api/member/projects  — create a new project (max 50 per member)
 *
 * Query params: ?workspaceId=<uuid>
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, createServiceRoleSupabaseClient } from '../../../../lib/security/auth';
import { applyRateLimit, RateLimitTier } from '../../../../lib/security';
import { handleOptions, getCorsHeaders, parseJsonRequest } from '../../../../lib/api';
import { createLogger } from '../../../../lib/logger';

const logger = createLogger('api/member/projects');

const MAX_PROJECTS_PER_MEMBER = 50;

const CreateProjectSchema = z.object({
    workspaceId: z.string().uuid(),
    name: z.string().min(1).max(200).default('Untitled Project'),
});

export async function OPTIONS() {
    return handleOptions();
}

export async function GET(request: NextRequest) {
    const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.LOW_COST);
    if (blocked) return blocked;

    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;

    const workspaceId = new URL(request.url).searchParams.get('workspaceId');
    if (!workspaceId) {
        return new Response(JSON.stringify({ error: 'workspaceId query param required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const supabase = createServiceRoleSupabaseClient();
    if (!supabase) return new Response(JSON.stringify({ error: 'Supabase not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });

    // Resolve member row for this user+workspace
    const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', authResult.userId)
        .maybeSingle();

    if (!member) {
        return new Response(JSON.stringify({ error: 'Not a member of this workspace' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    const { data: projects, error } = await supabase
        .from('workspace_projects')
        .select('id, name, created_at, updated_at')
        .eq('member_id', member.id)
        .order('updated_at', { ascending: false });

    if (error) return new Response(JSON.stringify({ error: 'Failed to fetch projects' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    return new Response(JSON.stringify(projects), {
        headers: { ...getCorsHeaders(request), ...rlHeaders, 'Content-Type': 'application/json' },
    });
}

export async function POST(request: NextRequest) {
    const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.LOW_COST);
    if (blocked) return blocked;

    getCorsHeaders(request, { rejectInvalidOrigin: true });

    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;

    const parsed = await parseJsonRequest(request, CreateProjectSchema);
    if (!parsed.ok) return parsed.response;

    const supabase = createServiceRoleSupabaseClient();
    if (!supabase) return new Response(JSON.stringify({ error: 'Supabase not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });

    const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('workspace_id', parsed.data.workspaceId)
        .eq('user_id', authResult.userId)
        .maybeSingle();

    if (!member) {
        return new Response(JSON.stringify({ error: 'Not a member of this workspace' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    // Enforce 50-project limit
    const { count } = await supabase
        .from('workspace_projects')
        .select('id', { count: 'exact', head: true })
        .eq('member_id', member.id);

    if ((count ?? 0) >= MAX_PROJECTS_PER_MEMBER) {
        return new Response(JSON.stringify({ error: `Project limit reached (max ${MAX_PROJECTS_PER_MEMBER})` }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const { data: project, error } = await supabase
        .from('workspace_projects')
        .insert({
            member_id: member.id,
            workspace_id: parsed.data.workspaceId,
            name: parsed.data.name,
            files_json: {},
        })
        .select('id, name, created_at, updated_at')
        .single();

    if (error || !project) {
        logger.error('Failed to create project', { error: error?.message });
        return new Response(JSON.stringify({ error: 'Failed to create project' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify(project), {
        status: 201,
        headers: { ...getCorsHeaders(request), ...rlHeaders, 'Content-Type': 'application/json' },
    });
}
