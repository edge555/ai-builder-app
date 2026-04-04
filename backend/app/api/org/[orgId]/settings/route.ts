/**
 * GET /api/org/:orgId/settings  — read org settings (labels; API key masked)
 * PUT /api/org/:orgId/settings  — update labels and/or API key
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, createServiceRoleSupabaseClient } from '../../../../../lib/security/auth';
import { applyRateLimit, RateLimitTier } from '../../../../../lib/security';
import { handleOptions, getCorsHeaders, corsError, parseJsonRequest } from '../../../../../lib/api';
import { encryptApiKey } from '../../../../../lib/security/crypto';
import { createLogger } from '../../../../../lib/logger';

const logger = createLogger('api/org/settings');

const UpdateSettingsSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    label_workspace: z.string().min(1).max(50).optional(),
    label_member: z.string().min(1).max(50).optional(),
    api_key: z.string().min(1).max(500).optional(),  // plaintext — encrypted before storage
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

    const { data: org, error } = await supabase
        .from('organizations')
        .select('name, slug, label_workspace, label_member, api_key_encrypted')
        .eq('id', orgId)
        .single();

    if (error || !org) return corsError(request, 'Not found', 404);

    return new Response(JSON.stringify({
        name: org.name,
        slug: org.slug,
        label_workspace: org.label_workspace,
        label_member: org.label_member,
        api_key_set: !!org.api_key_encrypted,  // never return the key or its encrypted form
    }), {
        headers: { ...getCorsHeaders(request), ...rlHeaders, 'Content-Type': 'application/json' },
    });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
    const { orgId } = await params;
    const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.LOW_COST);
    if (blocked) return blocked;

    getCorsHeaders(request, { rejectInvalidOrigin: true });

    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;

    const parsed = await parseJsonRequest(request, UpdateSettingsSchema);
    if (!parsed.ok) return parsed.response;

    const supabase = createServiceRoleSupabaseClient();
    if (!supabase) return corsError(request, 'Supabase not configured', 503);

    if (!await verifyOrgAdmin(supabase, orgId, authResult.userId)) {
        return corsError(request, 'Forbidden', 403);
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.name) updates.name = parsed.data.name;
    if (parsed.data.label_workspace) updates.label_workspace = parsed.data.label_workspace;
    if (parsed.data.label_member) updates.label_member = parsed.data.label_member;

    if (parsed.data.api_key) {
        if (!process.env.WORKSPACE_MASTER_KEY) {
            return corsError(request, 'WORKSPACE_MASTER_KEY not configured on server', 503);
        }
        updates.api_key_encrypted = await encryptApiKey(parsed.data.api_key);
        updates.api_key_key_version = 1;
    }

    if (Object.keys(updates).length === 0) {
        return corsError(request, 'No fields to update', 400);
    }

    const { error } = await supabase.from('organizations').update(updates).eq('id', orgId);
    if (error) {
        logger.error('Failed to update org settings', { error: error.message });
        return corsError(request, 'Failed to update settings', 500);
    }

    return new Response(JSON.stringify({ success: true, api_key_set: !!parsed.data.api_key }), {
        headers: { ...getCorsHeaders(request), ...rlHeaders, 'Content-Type': 'application/json' },
    });
}
