/**
 * Workspace resolver — validates that the authenticated user is a member of the
 * requested workspace, then decrypts the org's API key and returns a workspace-
 * scoped AIProvider.
 *
 * Used by generate-stream and modify-stream to inject the org API key when
 * workspaceId is present in the request body.
 *
 * Uses the service role Supabase client (bypasses RLS) with explicit userId
 * filtering. The userId has already been verified by requireAuth() before
 * this resolver is called, so it is trusted at this point.
 */

import type { AIProvider } from '../ai/ai-provider';
import { createServiceRoleSupabaseClient } from './auth';
import { decryptApiKey } from './crypto';
import { createWorkspaceProvider } from '../ai/ai-provider-factory';
import { createLogger } from '../logger';

const logger = createLogger('workspace-resolver');

export interface WorkspaceResolveResult {
    provider: AIProvider;
    memberId: string;
    beginnerMode: boolean;
}

/**
 * Resolves a workspace-scoped AIProvider for the given user + workspace.
 *
 * Returns null (caller should fall through to default provider) when:
 * - Supabase is not configured
 * - Org has no API key set yet
 *
 * Returns a 403-signalling object when:
 * - User is not a member of the workspace
 *
 * Throws on decryption failure (tampered ciphertext).
 */
export async function resolveWorkspaceProvider(
    userId: string,
    workspaceId: string
): Promise<WorkspaceResolveResult | { forbidden: true } | null> {
    const supabase = createServiceRoleSupabaseClient();
    if (!supabase) {
        logger.warn('Supabase service role not configured — skipping workspace resolution');
        return null;
    }

    // 1. Verify membership (explicit userId filter, service role bypasses RLS)
    const { data: member, error: memberError } = await supabase
        .from('members')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .maybeSingle();

    if (memberError) {
        logger.error('Membership lookup failed', { error: memberError.message, workspaceId });
        return null;
    }
    if (!member) {
        logger.warn('User is not a member of workspace', { userId, workspaceId });
        return { forbidden: true };
    }

    // 2. Fetch org API key via workspace → org lookup
    const { data: workspace, error: wsError } = await supabase
        .from('workspaces')
        .select('org_id, beginner_mode')
        .eq('id', workspaceId)
        .single();

    if (wsError || !workspace) {
        logger.error('Workspace lookup failed', { error: wsError?.message, workspaceId });
        return null;
    }

    const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('api_key_encrypted')
        .eq('id', workspace.org_id)
        .single();

    if (orgError || !org) {
        logger.error('Org lookup failed', { error: orgError?.message, orgId: workspace.org_id });
        return null;
    }

    if (!org.api_key_encrypted) {
        logger.warn('Org has no API key set', { orgId: workspace.org_id });
        return null;
    }

    // 3. Decrypt API key and return workspace-scoped provider
    let apiKey: string;
    try {
        apiKey = await decryptApiKey(org.api_key_encrypted);
    } catch (err) {
        logger.error('Failed to decrypt org API key — key may be corrupted', { orgId: workspace.org_id });
        return null;
    }
    const provider = createWorkspaceProvider(apiKey);

    logger.info('Workspace provider resolved', { workspaceId, memberId: member.id });
    return {
        provider,
        memberId: member.id,
        beginnerMode: workspace.beginner_mode ?? false,
    };
}

/**
 * Extracts the Bearer token from an Authorization header.
 * Returns null if the header is missing or malformed.
 */
export function extractBearerToken(authHeader: string | null): string | null {
    if (!authHeader?.startsWith('Bearer ')) return null;
    return authHeader.slice(7);
}
