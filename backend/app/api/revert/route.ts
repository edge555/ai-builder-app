/**
 * Revert API Endpoint
 * POST /api/revert
 *
 * Reverts a project to a specific version, creating a new version for the revert action.
 * Implements Requirement 6.2
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, RateLimitTier } from '../../../lib/security';
import type { RevertVersionResponse, ErrorResponse } from '@ai-app-builder/shared';
import { serializeProjectState, serializeVersion, RevertVersionRequestSchema } from '@ai-app-builder/shared';
import { getVersionManager } from '../../../lib/core';
import { getCorsHeaders, handleOptions, handleError, AppError, withTimeout, TimeoutError, parseJsonRequest, withRouteContext } from '../../../lib/api';
import { REVERT_TIMEOUT_MS } from '../../../lib/constants';

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

export const POST = withRouteContext('api/revert', async (ctx, request: NextRequest) => {
  const { contextLogger } = ctx;
  const { blocked, headers: rlHeaders } = applyRateLimit(request, RateLimitTier.LOW_COST);
  ctx.setRateLimitHeaders(rlHeaders);
  if (blocked) return blocked as NextResponse<RevertVersionResponse | ErrorResponse>;

  const parsed = await parseJsonRequest(request, RevertVersionRequestSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const start = Date.now();
    const versionManager = getVersionManager();

    const result = await withTimeout(
      Promise.resolve(versionManager.revertToVersion(parsed.data.projectId, parsed.data.versionId)),
      {
        timeoutMs: REVERT_TIMEOUT_MS,
        operationName: 'version revert',
        signal: request.signal,
      }
    );

    if (!result.success) {
      throw AppError.state('REVERT_FAILED', result.error ?? 'Failed to revert to version', undefined, 404);
    }

    contextLogger.info('Revert complete', { durationMs: Date.now() - start });

    const response: RevertVersionResponse = {
      success: true,
      projectState: serializeProjectState(result.projectState!),
      version: serializeVersion(result.version!),
    };

    return NextResponse.json(response, { status: 200, headers: getCorsHeaders(request, { rejectInvalidOrigin: true }) });

  } catch (error) {
    if (error instanceof TimeoutError) {
      contextLogger.error('Revert operation timed out', { timeoutMs: error.timeoutMs });
      const timeoutError = AppError.network(
        'OPERATION_TIMEOUT',
        `Version revert timed out after ${error.timeoutMs / 1000} seconds`,
        { timeoutMs: error.timeoutMs },
        504
      );
      return handleError(timeoutError, 'api/revert', request);
    }

    return handleError(error, 'api/revert', request);
  }
});
