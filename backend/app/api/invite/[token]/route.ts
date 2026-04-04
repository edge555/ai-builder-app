/**
 * GET  /api/invite/:token  — validate invite token, return workspace/org details
 * POST /api/invite/:token  — accept invite: bind user_id + update workspace_ids metadata
 */

import { NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { requireAuth, createServiceRoleSupabaseClient } from '../../../../lib/security/auth';
import { applyRateLimit, RateLimitTier } from '../../../../lib/security';
import { handleOptions, getCorsHeaders } from '../../../../lib/api';
import { createLogger } from '../../../../lib/logger';

const logger = createLogger('api/invite');

function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

export async function OPTIONS() {
    return handleOptions();
}

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
    const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.LOW_COST);
    if (blocked) return blocked;

    const supabase = createServiceRoleSupabaseClient();
    if (!supabase) return new Response(JSON.stringify({ error: 'Supabase not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });

    const tokenHash = hashToken(params.token);

    const { data: member, error } = await supabase
        .from('members')
        .select('id, email, display_name, workspace_id, invite_token_expires_at, joined_at')
        .eq('invite_token_hash', tokenHash)
        .maybeSingle();

    if (error || !member) {
        return new Response(JSON.stringify({ error: 'Invalid invite link' }), { status: 410, headers: { 'Content-Type': 'application/json' } });
    }
    if (member.joined_at) {
        return new Response(JSON.stringify({ error: 'This invite has already been used' }), { status: 410, headers: { 'Content-Type': 'application/json' } });
    }
    if (member.invite_token_expires_at && new Date(member.invite_token_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: 'This invite link has expired' }), { status: 410, headers: { 'Content-Type': 'application/json' } });
    }

    // Fetch workspace + org names for display
    const { data: workspace } = await supabase
        .from('workspaces')
        .select('name, org_id')
        .eq('id', member.workspace_id)
        .single();

    const { data: org } = workspace
        ? await supabase.from('organizations').select('name').eq('id', workspace.org_id).single()
        : { data: null };

    return new Response(JSON.stringify({
        email: member.email,
        displayName: member.display_name,
        workspaceId: member.workspace_id,
        workspaceName: workspace?.name,
        orgName: org?.name,
    }), {
        headers: { ...getCorsHeaders(request), ...rlHeaders, 'Content-Type': 'application/json' },
    });
}

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
    const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.LOW_COST);
    if (blocked) return blocked;

    getCorsHeaders(request, { rejectInvalidOrigin: true });

    // User must be authenticated before accepting an invite
    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;

    const supabase = createServiceRoleSupabaseClient();
    if (!supabase) return new Response(JSON.stringify({ error: 'Supabase not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });

    const tokenHash = hashToken(params.token);

    const { data: member, error } = await supabase
        .from('members')
        .select('id, email, workspace_id, invite_token_expires_at, joined_at')
        .eq('invite_token_hash', tokenHash)
        .maybeSingle();

    if (error || !member) {
        return new Response(JSON.stringify({ error: 'Invalid invite link' }), { status: 410, headers: { 'Content-Type': 'application/json' } });
    }
    if (member.joined_at) {
        return new Response(JSON.stringify({ error: 'This invite has already been used' }), { status: 410, headers: { 'Content-Type': 'application/json' } });
    }
    if (member.invite_token_expires_at && new Date(member.invite_token_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: 'This invite link has expired' }), { status: 410, headers: { 'Content-Type': 'application/json' } });
    }

    // Verify that the authenticated user's email matches the invite email
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(authResult.userId);
    if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Failed to verify user' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    if (user.email?.toLowerCase() !== member.email.toLowerCase()) {
        return new Response(JSON.stringify({ error: 'This invite was sent to a different email address' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    // Accept invite: bind user_id, set joined_at, clear token
    const { error: updateError } = await supabase
        .from('members')
        .update({
            user_id: authResult.userId,
            joined_at: new Date().toISOString(),
            invite_token_hash: null,
            invite_token_expires_at: null,
        })
        .eq('id', member.id);

    if (updateError) {
        logger.error('Failed to accept invite', { error: updateError.message });
        return new Response(JSON.stringify({ error: 'Failed to accept invite' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // Append workspaceId to user_metadata.workspace_ids
    const existingIds: string[] = user.user_metadata?.workspace_ids ?? [];
    if (!existingIds.includes(member.workspace_id)) {
        await supabase.auth.admin.updateUserById(authResult.userId, {
            user_metadata: { ...user.user_metadata, workspace_ids: [...existingIds, member.workspace_id] },
        });
    }

    logger.info('Invite accepted', { userId: authResult.userId, workspaceId: member.workspace_id });

    return new Response(JSON.stringify({ workspaceId: member.workspace_id }), {
        headers: { ...getCorsHeaders(request), ...rlHeaders, 'Content-Type': 'application/json' },
    });
}
