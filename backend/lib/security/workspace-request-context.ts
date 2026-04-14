import type { NextRequest } from 'next/server';
import type { AIProvider } from '../ai/ai-provider';
import { requireAuth } from './auth';
import { resolveWorkspaceProvider } from './workspace-resolver';

export interface WorkspaceRequestContext {
  workspaceProvider?: AIProvider;
  memberId?: string;
  beginnerMode: boolean;
  authResponse?: Response;
  forbidden: boolean;
}

export async function resolveWorkspaceRequestContext(
  request: NextRequest,
  workspaceId?: string
): Promise<WorkspaceRequestContext> {
  if (!workspaceId) {
    return { beginnerMode: false, forbidden: false };
  }

  const authResult = await requireAuth(request);
  if (authResult instanceof Response) {
    return {
      beginnerMode: false,
      forbidden: false,
      authResponse: authResult,
    };
  }

  const resolved = await resolveWorkspaceProvider(authResult.userId, workspaceId);
  if (!resolved) {
    return { beginnerMode: false, forbidden: false };
  }

  if ('forbidden' in resolved) {
    return { beginnerMode: false, forbidden: true };
  }

  return {
    workspaceProvider: resolved.provider,
    memberId: resolved.memberId,
    beginnerMode: resolved.beginnerMode,
    forbidden: false,
  };
}
