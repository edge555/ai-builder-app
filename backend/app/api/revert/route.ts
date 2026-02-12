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
import { getCorsHeaders, handleOptions, handleError, AppError } from '../../../lib/api';

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

    // Perform revert operation
    const versionManager = getVersionManager();
    const result = versionManager.revertToVersion(validatedRequest.projectId, validatedRequest.versionId);

    if (!result.success) {
      throw AppError.state('REVERT_FAILED', result.error ?? 'Failed to revert to version', undefined, 404);
    }

    // Return successful response
    const response: RevertVersionResponse = {
      success: true,
      projectState: serializeProjectState(result.projectState!),
      version: serializeVersion(result.version!),
    };

    return NextResponse.json(response, { status: 200, headers: getCorsHeaders() });
  } catch (error) {
    return handleError(error, 'api/revert');
  }
}
