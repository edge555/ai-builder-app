/**
 * Versions API Endpoint
 * GET /api/versions?projectId={projectId}
 *
 * Returns a list of all versions for a project with metadata.
 * Implements Requirement 10.4
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, RateLimitTier } from '../../../lib/security';
import type { GetVersionsResponse, ErrorResponse } from '@ai-app-builder/shared';
import { serializeVersion, GetVersionsRequestSchema } from '@ai-app-builder/shared';
import { getVersionManager } from '../../../lib/core';
import { getCorsHeaders, handleOptions, handleError, withRouteContext } from '../../../lib/api';

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

export const GET = withRouteContext('api/versions', async (ctx, request: NextRequest) => {
  const { contextLogger } = ctx;
  const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.LOW_COST);
  ctx.setRateLimitHeaders(rlHeaders);
  if (blocked) return blocked as NextResponse<GetVersionsResponse | ErrorResponse>;

  try {
    const start = Date.now();

    // Get projectId from query parameters
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    // Validate request
    const validatedRequest = GetVersionsRequestSchema.parse({ projectId });

    // Get versions from the version manager
    const versionManager = getVersionManager();
    const versions = versionManager.getAllVersions(validatedRequest.projectId);

    // Serialize versions for JSON transport
    const serializedVersions = versions.map(serializeVersion);

    contextLogger.info('Versions fetched', { durationMs: Date.now() - start, count: serializedVersions.length });

    const response: GetVersionsResponse = { versions: serializedVersions };
    return NextResponse.json(response, { status: 200, headers: getCorsHeaders(request) });

  } catch (error) {
    return handleError(error, 'api/versions', request);
  }
});
