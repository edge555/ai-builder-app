/**
 * Diff API Endpoint
 * POST /api/diff
 *
 * Computes diffs between two versions.
 * Implements Requirement 10.3
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, RateLimitTier } from '../../../lib/security';
import type { ComputeDiffResponse, ErrorResponse } from '@ai-app-builder/shared/types';
import { ComputeDiffRequestSchema } from '@ai-app-builder/shared/schemas';
import { getVersionManager } from '../../../lib/core';
import { getDiffEngine } from '../../../lib/diff';
import { getCorsHeaders, handleOptions, handleError, AppError, withTimeout, TimeoutError, parseJsonRequest, withRouteContext } from '../../../lib/api';
import { DIFF_TIMEOUT_MS } from '../../../lib/constants';

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

export const POST = withRouteContext('api/diff', async (ctx, request: NextRequest) => {
  const { contextLogger } = ctx;
  const { blocked, headers: rlHeaders } = applyRateLimit(request, RateLimitTier.LOW_COST);
  ctx.setRateLimitHeaders(rlHeaders);
  if (blocked) return blocked as NextResponse<ComputeDiffResponse | ErrorResponse>;

  const parsed = await parseJsonRequest(request, ComputeDiffRequestSchema);
  if (!parsed.ok) return parsed.response;

  const { fromVersionId, toVersionId, projectId: projectIdParam } = parsed.data;

  try {
    const start = Date.now();
    const versionManager = getVersionManager();

    // We need to find the versions - they could be in any project
    let fromVersion = null;
    let toVersion = null;
    let projectId: string | null = null;

    if (projectIdParam) {
      fromVersion = versionManager.getVersion(projectIdParam, fromVersionId);
      toVersion = versionManager.getVersion(projectIdParam, toVersionId);
      projectId = projectIdParam;
    } else {
      const fromResult = versionManager.findVersion(fromVersionId);
      const toResult = versionManager.findVersion(toVersionId);

      if (fromResult) {
        fromVersion = fromResult.version;
        projectId = fromResult.projectId;
      }

      if (toResult) {
        toVersion = toResult.version;
        if (projectId && toResult.projectId !== projectId) {
          throw AppError.state(
            'VERSION_PROJECT_MISMATCH',
            'Requested versions belong to different projects',
            { fromProjectId: projectId, toProjectId: toResult.projectId }
          );
        }
        projectId = toResult.projectId;
      }
    }

    if (!fromVersion) {
      throw AppError.state(
        'FROM_VERSION_NOT_FOUND',
        `Version with ID '${fromVersionId}' not found`,
        { versionId: fromVersionId },
        404
      );
    }

    if (!toVersion) {
      throw AppError.state(
        'TO_VERSION_NOT_FOUND',
        `Version with ID '${toVersionId}' not found`,
        { versionId: toVersionId },
        404
      );
    }

    // Compute diffs between the two versions with timeout
    const diffs = await withTimeout(
      Promise.resolve(getDiffEngine().computeDiffsFromFiles(fromVersion.files, toVersion.files)),
      {
        timeoutMs: DIFF_TIMEOUT_MS,
        operationName: 'diff computation',
        signal: request.signal,
      }
    );

    contextLogger.info('Diff complete', { durationMs: Date.now() - start });

    const response: ComputeDiffResponse = { success: true, diffs };
    return NextResponse.json(response, { status: 200, headers: getCorsHeaders(request, { rejectInvalidOrigin: true }) });

  } catch (error) {
    if (error instanceof TimeoutError) {
      contextLogger.error('Diff computation timed out', { timeoutMs: error.timeoutMs });
      const timeoutError = AppError.network(
        'OPERATION_TIMEOUT',
        `Diff computation timed out after ${error.timeoutMs / 1000} seconds`,
        { timeoutMs: error.timeoutMs },
        504
      );
      return handleError(timeoutError, 'api/diff', request);
    }

    return handleError(error, 'api/diff', request);
  }
});
