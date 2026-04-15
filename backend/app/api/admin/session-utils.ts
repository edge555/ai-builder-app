import { createServiceRoleSupabaseClient } from '../../../lib/security/auth';

export function normalizeFilesAffected(value: unknown): string[] | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === 'string');
      }
    } catch {
      return null;
    }
  }
  return null;
}

export async function verifyWorkspaceAdmin(
  supabase: NonNullable<ReturnType<typeof createServiceRoleSupabaseClient>>,
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('org_id')
    .eq('id', workspaceId)
    .maybeSingle<{ org_id: string }>();

  if (!workspace) return false;

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('id', workspace.org_id)
    .eq('admin_user_id', userId)
    .maybeSingle<{ id: string }>();

  return !!org;
}
