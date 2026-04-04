/**
 * GET    /api/org/:orgId/workspaces/:wid/members  — list members
 * POST   /api/org/:orgId/workspaces/:wid/members  — invite member (sends email via Resend)
 * DELETE /api/org/:orgId/workspaces/:wid/members  — remove member (body: { memberId })
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createHash } from 'crypto';
import { Resend } from 'resend';
import { requireAuth, createServiceRoleSupabaseClient } from '../../../../../../../lib/security/auth';
import { applyRateLimit, RateLimitTier } from '../../../../../../../lib/security';
import { handleOptions, getCorsHeaders, corsError, parseJsonRequest } from '../../../../../../../lib/api';
import { createLogger } from '../../../../../../../lib/logger';

const logger = createLogger('api/org/members');

const INVITE_EXPIRES_HOURS = 72;

const InviteSchema = z.object({
    email: z.string().email().max(320),
    display_name: z.string().min(1).max(200),
});

const RemoveMemberSchema = z.object({
    memberId: z.string().uuid(),
});

async function verifyOrgAdmin(supabase: ReturnType<typeof createServiceRoleSupabaseClient>, orgId: string, userId: string): Promise<boolean> {
    const { data } = await supabase!.from('organizations').select('id').eq('id', orgId).eq('admin_user_id', userId).maybeSingle();
    return !!data;
}

async function verifyWorkspaceInOrg(supabase: ReturnType<typeof createServiceRoleSupabaseClient>, orgId: string, wid: string): Promise<boolean> {
    const { data } = await supabase!.from('workspaces').select('id').eq('id', wid).eq('org_id', orgId).maybeSingle();
    return !!data;
}

export async function OPTIONS() {
    return handleOptions();
}

export async function GET(request: NextRequest, { params }: { params: { orgId: string; wid: string } }) {
    const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.LOW_COST);
    if (blocked) return blocked;

    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;

    const supabase = createServiceRoleSupabaseClient();
    if (!supabase) return corsError(request, 'Supabase not configured', 503);

    if (!await verifyOrgAdmin(supabase, params.orgId, authResult.userId)) {
        return corsError(request, 'Forbidden', 403);
    }

    const { data: members, error } = await supabase
        .from('members')
        .select('id, email, display_name, joined_at, invite_token_expires_at, created_at')
        .eq('workspace_id', params.wid)
        .order('created_at', { ascending: true });

    if (error) return corsError(request, 'Failed to fetch members', 500);

    // Compute status without exposing tokens
    const result = members.map((m: typeof members[number]) => ({
        ...m,
        status: m.joined_at ? 'joined' : (m.invite_token_expires_at && new Date(m.invite_token_expires_at) > new Date() ? 'pending' : 'expired'),
        invite_token_expires_at: undefined,
    }));

    return new Response(JSON.stringify(result), {
        headers: { ...getCorsHeaders(request), ...rlHeaders, 'Content-Type': 'application/json' },
    });
}

export async function POST(request: NextRequest, { params }: { params: { orgId: string; wid: string } }) {
    const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.LOW_COST);
    if (blocked) return blocked;

    getCorsHeaders(request, { rejectInvalidOrigin: true });

    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;

    const parsed = await parseJsonRequest(request, InviteSchema);
    if (!parsed.ok) return parsed.response;

    const supabase = createServiceRoleSupabaseClient();
    if (!supabase) return corsError(request, 'Supabase not configured', 503);

    if (!await verifyOrgAdmin(supabase, params.orgId, authResult.userId)) {
        return corsError(request, 'Forbidden', 403);
    }
    if (!await verifyWorkspaceInOrg(supabase, params.orgId, params.wid)) {
        return corsError(request, 'Workspace not found', 404);
    }

    // Generate invite token: random 32-byte hex string
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const inviteToken = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const tokenHash = createHash('sha256').update(inviteToken).digest('hex');
    const expiresAt = new Date(Date.now() + INVITE_EXPIRES_HOURS * 60 * 60 * 1000).toISOString();

    // Fetch org details for email
    const { data: org } = await supabase.from('organizations').select('name').eq('id', params.orgId).single();
    const { data: workspace } = await supabase.from('workspaces').select('name').eq('id', params.wid).single();

    // Insert member row
    const { data: member, error: memberError } = await supabase
        .from('members')
        .insert({
            workspace_id: params.wid,
            email: parsed.data.email,
            display_name: parsed.data.display_name,
            invite_token_hash: tokenHash,
            invite_token_expires_at: expiresAt,
        })
        .select('id')
        .single();

    if (memberError || !member) {
        logger.error('Failed to create member', { error: memberError?.message });
        if (memberError?.code === '23505') {
            return corsError(request, 'This email is already invited to this workspace', 409);
        }
        return corsError(request, 'Failed to create invite', 500);
    }

    // Send invite email via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
        logger.warn('RESEND_API_KEY not set — invite email not sent');
    } else {
        const resend = new Resend(resendKey);
        const appUrl = process.env.APP_URL ?? 'https://app.blankcanvas.dev';
        const inviteUrl = `${appUrl}/join/${inviteToken}`;

        const { error: emailError } = await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL ?? 'invite@blankcanvas.dev',
            to: parsed.data.email,
            subject: `You've been invited to ${workspace?.name ?? 'a workspace'} on Blank Canvas`,
            html: `<p>Hi ${parsed.data.display_name},</p>
<p>You've been invited to join <strong>${workspace?.name ?? 'a workspace'}</strong> at ${org?.name ?? 'an organization'} on Blank Canvas.</p>
<p><a href="${inviteUrl}">Accept your invitation</a></p>
<p>This link expires in ${INVITE_EXPIRES_HOURS} hours.</p>`,
        });

        if (emailError) {
            // Rollback: delete the member row since email failed
            await supabase.from('members').delete().eq('id', member.id);
            logger.error('Failed to send invite email', { error: emailError.message });
            return corsError(request, 'Failed to send invite email', 500);
        }
    }

    logger.info('Invite sent', { memberId: member.id, email: parsed.data.email });

    return new Response(JSON.stringify({ memberId: member.id, email: parsed.data.email, status: 'pending' }), {
        status: 201,
        headers: { ...getCorsHeaders(request), ...rlHeaders, 'Content-Type': 'application/json' },
    });
}

export async function DELETE(request: NextRequest, { params }: { params: { orgId: string; wid: string } }) {
    const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.LOW_COST);
    if (blocked) return blocked;

    getCorsHeaders(request, { rejectInvalidOrigin: true });

    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;

    const parsed = await parseJsonRequest(request, RemoveMemberSchema);
    if (!parsed.ok) return parsed.response;

    const supabase = createServiceRoleSupabaseClient();
    if (!supabase) return corsError(request, 'Supabase not configured', 503);

    if (!await verifyOrgAdmin(supabase, params.orgId, authResult.userId)) {
        return corsError(request, 'Forbidden', 403);
    }

    const { error } = await supabase
        .from('members')
        .delete()
        .eq('id', parsed.data.memberId)
        .eq('workspace_id', params.wid);

    if (error) {
        return corsError(request, 'Failed to remove member', 500);
    }

    return new Response(null, {
        status: 204,
        headers: { ...getCorsHeaders(request), ...rlHeaders },
    });
}
