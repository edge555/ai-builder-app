/**
 * Revert API Endpoint
 * POST /api/revert
 * 
 * Reverts a project to a specific version, creating a new version for the revert action.
 * Implements Requirement 6.2
 */

import { NextRequest, NextResponse } from 'next/server';
import type {
  RevertVersionResponse,
  ErrorResponse,
} from '@ai-app-builder/shared';
import {
  serializeProjectState,
  serializeVersion,
  RevertVersionRequestSchema,
} from '@ai-app-builder/shared';
import { getVersionManager } from '../../../lib/core';
import { getCorsHeaders, handleOptions, handleError, AppError, withTimeout, TimeoutError } from '../../../lib/api';
import { createLogger } from '../../../lib/logger';

const logger = createLogger('api/revert');

// Timeout for revert operations (30 seconds)
const REVERT_TIMEOUT_MS = 30_000;

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<RevertVersionResponse | ErrorResponse>> {
  try {
    // Parse request body
    const body = await request.json();

    // Validate request
    const validatedRequest = RevertVersionRequestSchema.parse(body);

    // Perform revert operation with timeout
    const versionManager = getVersionManager();
    const result = await withTimeout(
      Promise.resolve(versionManager.revertToVersion(validatedRequest.projectId, validatedRequest.versionId)),
      {
        timeoutMs: REVERT_TIMEOUT_MS,
        operationName: 'version revert',
        signal: request.signal,
      }
    );

    if (!result.success) {
      throw AppError.state('REVERT_FAILED', result.error ?? 'Failed to revert to version', undefined, 404);
    }

    // Return successful response
    const response: RevertVersionResponse = {
      success: true,
      projectState: serializeProjectState(result.projectState!),
      version: serializeVersion(result.version!),
    };

    return NextResponse.json(response, { status: 200, headers: getCorsHeaders(request) });
  } catch (error) {
    // Handle timeout errors specifically
    if (error instanceof TimeoutError) {
      logger.error('Revert operation timed out', {
        timeoutMs: error.timeoutMs,
      });
      const timeoutError = AppError.network(
        'OPERATION_TIMEOUT',
        // Convert milliseconds to seconds (1000ms = 1s) for human-readable message
        `Version revert timed out after ${error.timeoutMs / 1000} seconds`,
        { timeoutMs: error.timeoutMs },
        504
      );
      return handleError(timeoutError, 'api/revert', request);
    }

    return handleError(error, 'api/revert', request);
  }
}
