/**
 * POST /api/org
 * Creates a new Organization for the authenticated user.
 * The calling user becomes admin_user_id.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, createServiceRoleSupabaseClient } from '../../../lib/security/auth';
import { applyRateLimit, RateLimitTier } from '../../../lib/security';
import { handleOptions, getCorsHeaders, corsError, parseJsonRequest } from '../../../lib/api';
import { createLogger } from '../../../lib/logger';

const logger = createLogger('api/org');

const CreateOrgSchema = z.object({
    name: z.string().min(1).max(200),
    slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens').optional(),
});

export async function OPTIONS() {
    return handleOptions();
}

export async function POST(request: NextRequest) {
    const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.LOW_COST);
    if (blocked) return blocked;

    getCorsHeaders(request, { rejectInvalidOrigin: true });

    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;

    const parsed = await parseJsonRequest(request, CreateOrgSchema);
    if (!parsed.ok) return parsed.response;

    const supabase = createServiceRoleSupabaseClient();
    if (!supabase) {
        return corsError(request, 'Supabase not configured', 503);
    }

    const slug = parsed.data.slug ?? parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);

    const { data: org, error } = await supabase
        .from('organizations')
        .insert({
            name: parsed.data.name,
            slug,
            admin_user_id: authResult.userId,
        })
        .select('id, name, slug')
        .single();

    if (error) {
        logger.error('Failed to create org', { error: error.message });
        if (error.code === '23505') {
            return corsError(request, 'An organization with this slug already exists', 409);
        }
        return corsError(request, 'Failed to create organization', 500);
    }

    return new Response(JSON.stringify(org), {
        status: 201,
        headers: { ...getCorsHeaders(request), ...rlHeaders, 'Content-Type': 'application/json' },
    });
}
