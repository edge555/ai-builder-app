/**
 * POST /api/org/self-provision
 * Idempotent: creates Org + Workspace + Member for the authenticated user.
 * If the user already has an org, returns the existing { orgId, workspaceId }.
 * Appends workspaceId to user_metadata.workspace_ids[].
 */

import { NextRequest } from 'next/server';
import { requireAuth, createServiceRoleSupabaseClient } from '../../../../lib/security/auth';
import { applyRateLimit, RateLimitTier } from '../../../../lib/security';
import { handleOptions, getCorsHeaders } from '../../../../lib/api';
import { createLogger } from '../../../../lib/logger';
import { createClient } from '@supabase/supabase-js';

const logger = createLogger('api/org/self-provision');

export async function OPTIONS() {
    return handleOptions();
}

export async function POST(request: NextRequest) {
    const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.LOW_COST);
    if (blocked) return blocked;

    getCorsHeaders(request, { rejectInvalidOrigin: true });

    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;

    const supabase = createServiceRoleSupabaseClient();
    if (!supabase) {
        return new Response(JSON.stringify({ error: 'Supabase not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }

    // Idempotency: check if org already exists for this user
    const { data: existingOrg } = await supabase
        .from('organizations')
        .select('id')
        .eq('admin_user_id', authResult.userId)
        .maybeSingle();

    if (existingOrg) {
        const { data: workspace } = await supabase
            .from('workspaces')
            .select('id')
            .eq('org_id', existingOrg.id)
            .limit(1)
            .maybeSingle();

        return new Response(JSON.stringify({ orgId: existingOrg.id, workspaceId: workspace?.id }), {
            headers: { ...getCorsHeaders(request), ...rlHeaders, 'Content-Type': 'application/json' },
        });
    }

    // Fetch user email/display name from Supabase Auth
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(authResult.userId);
    if (userError || !user) {
        logger.error('Failed to fetch user', { error: userError?.message });
        return new Response(JSON.stringify({ error: 'Failed to fetch user' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const displayName = user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'User';
    const emailPrefix = user.email?.split('@')[0] ?? 'user';
    const slug = `${emailPrefix}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 100);

    // Create Org → Workspace → Member atomically (sequential inserts)
    const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({ name: displayName, slug, admin_user_id: authResult.userId })
        .select('id')
        .single();

    if (orgError || !org) {
        logger.error('Failed to create org', { error: orgError?.message });
        return new Response(JSON.stringify({ error: 'Failed to create organization' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const { data: workspace, error: wsError } = await supabase
        .from('workspaces')
        .insert({ org_id: org.id, name: 'Personal' })
        .select('id')
        .single();

    if (wsError || !workspace) {
        logger.error('Failed to create workspace', { error: wsError?.message });
        return new Response(JSON.stringify({ error: 'Failed to create workspace' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    await supabase.from('members').insert({
        workspace_id: workspace.id,
        user_id: authResult.userId,
        email: user.email ?? '',
        display_name: displayName,
        joined_at: new Date().toISOString(),
    });

    // Append workspaceId to user_metadata.workspace_ids
    const existingIds: string[] = user.user_metadata?.workspace_ids ?? [];
    await supabase.auth.admin.updateUserById(authResult.userId, {
        user_metadata: { ...user.user_metadata, workspace_ids: [...existingIds, workspace.id] },
    });

    logger.info('Self-provision complete', { userId: authResult.userId, orgId: org.id, workspaceId: workspace.id });

    return new Response(JSON.stringify({ orgId: org.id, workspaceId: workspace.id }), {
        status: 201,
        headers: { ...getCorsHeaders(request), ...rlHeaders, 'Content-Type': 'application/json' },
    });
}
