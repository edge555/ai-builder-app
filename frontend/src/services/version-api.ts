import { FUNCTIONS_BASE_URL, SUPABASE_ANON_KEY } from '@/integrations/backend/client';
import type {
  GetVersionsResponse,
  RevertVersionResponse,
  ComputeDiffResponse,
  SerializedVersion,
  FileDiff,
  SerializedProjectState,
} from '@ai-app-builder/shared/types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('version-api');

function apiHeaders() {
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
}

export async function fetchVersions(projectId: string): Promise<SerializedVersion[]> {
  const response = await fetch(
    `${FUNCTIONS_BASE_URL}/versions?projectId=${encodeURIComponent(projectId)}`,
    { headers: apiHeaders() }
  );
  if (!response.ok) {
    logger.error('Failed to fetch versions', { status: response.status });
    throw new Error(`Failed to fetch versions: ${response.status}`);
  }
  const data: GetVersionsResponse = await response.json();
  return data.versions;
}

export async function revertToVersion(
  projectId: string,
  versionId: string
): Promise<{ projectState: SerializedProjectState; version: SerializedVersion }> {
  const response = await fetch(`${FUNCTIONS_BASE_URL}/revert`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ projectId, versionId }),
  });
  if (!response.ok) {
    logger.error('Failed to revert version', { status: response.status });
    throw new Error(`Failed to revert: ${response.status}`);
  }
  const data: RevertVersionResponse = await response.json();
  if (!data.success || !data.projectState || !data.version) {
    throw new Error(data.error ?? 'Revert failed');
  }
  return { projectState: data.projectState, version: data.version };
}

export async function fetchDiff(
  fromVersionId: string,
  toVersionId: string,
  projectId?: string
): Promise<FileDiff[]> {
  const response = await fetch(`${FUNCTIONS_BASE_URL}/diff`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ fromVersionId, toVersionId, projectId }),
  });
  if (!response.ok) {
    logger.error('Failed to fetch diff', { status: response.status });
    throw new Error(`Failed to fetch diff: ${response.status}`);
  }
  const data: ComputeDiffResponse = await response.json();
  return data.diffs ?? [];
}
