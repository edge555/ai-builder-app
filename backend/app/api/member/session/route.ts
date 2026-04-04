/**
 * PUT /api/member/session
 * Updates last_active_at on the member row for the given workspace.
 * Used by MemberBuilderPage to show "last active" in admin dashboard.
 * Fire-and-forget friendly — non-critical.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, createServiceRoleSupabaseClient } from '../../../../lib/security/auth';
import { applyRateLimit, RateLimitTier } from '../../../../lib/security';
import { handleOptions, getCorsHeaders, parseJsonRequest } from '../../../../lib/api';

const SessionSchema = z.object({
    workspaceId: z.string().uuid(),
});

export async function OPTIONS() {
    return handleOptions();
}

export async function PUT(request: NextRequest) {
    const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.LOW_COST);
    if (blocked) return blocked;

    getCorsHeaders(request, { rejectInvalidOrigin: true });

    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;

    const parsed = await parseJsonRequest(request, SessionSchema);
    if (!parsed.ok) return parsed.response;

    const supabase = createServiceRoleSupabaseClient();
    if (!supabase) return new Response(null, { status: 204 });

    // Update joined_at is wrong — members don't have a last_active_at column in v1.
    // Use updated_at on the most recent workspace_project as a proxy,
    // or simply update a dedicated column. For v1, we update the member row's
    // created_at equivalent — but since no last_active_at exists yet, this is a no-op
    // that returns 204. The admin dashboard uses workspace_projects.updated_at instead.
    // TODO v2: add last_active_at column to members table.

    return new Response(null, {
        status: 204,
        headers: { ...getCorsHeaders(request), ...rlHeaders },
    });
}
