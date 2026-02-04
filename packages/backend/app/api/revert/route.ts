/**
 * Revert API Endpoint
 * POST /api/revert
 * 
 * Reverts a project to a specific version, creating a new version for the revert action.
 * Implements Requirement 6.2
 */

import { NextRequest, NextResponse } from 'next/server';
import type {
  RevertVersionRequest,
  RevertVersionResponse,
  ErrorResponse,
} from '@ai-app-builder/shared';
import {
  serializeProjectState,
  serializeVersion,
} from '@ai-app-builder/shared';
import { getVersionManager } from '../../../lib/core';
import { getCorsHeaders, handleOptions, createErrorResponse } from '../../../lib/api';
import { createLogger } from '../../../lib/logger';

const logger = createLogger('api/revert');

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<RevertVersionResponse | ErrorResponse>> {
  const corsHeaders = getCorsHeaders();
  
  try {
    // Parse request body
    let body: RevertVersionRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        createErrorResponse({ type: 'api', code: 'INVALID_REQUEST_BODY', message: 'Invalid JSON in request body' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate projectId
    if (!body.projectId || typeof body.projectId !== 'string') {
      return NextResponse.json(
        createErrorResponse({ type: 'api', code: 'MISSING_PROJECT_ID', message: 'Project ID is required' }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (body.projectId.trim().length === 0) {
      return NextResponse.json(
        createErrorResponse({ type: 'api', code: 'EMPTY_PROJECT_ID', message: 'Project ID cannot be empty' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate versionId
    if (!body.versionId || typeof body.versionId !== 'string') {
      return NextResponse.json(
        createErrorResponse({ type: 'api', code: 'MISSING_VERSION_ID', message: 'Version ID is required' }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (body.versionId.trim().length === 0) {
      return NextResponse.json(
        createErrorResponse({ type: 'api', code: 'EMPTY_VERSION_ID', message: 'Version ID cannot be empty' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Perform revert operation
    const versionManager = getVersionManager();
    const result = versionManager.revertToVersion(body.projectId, body.versionId);

    if (!result.success) {
      return NextResponse.json(
        createErrorResponse({
          type: 'state',
          code: 'REVERT_FAILED',
          message: result.error ?? 'Failed to revert to version'
        }),
        { status: 404, headers: corsHeaders }
      );
    }

    // Return successful response
    const response: RevertVersionResponse = {
      success: true,
      projectState: serializeProjectState(result.projectState!),
      version: serializeVersion(result.version!),
    };

    return NextResponse.json(response, { status: 200, headers: corsHeaders });
  } catch (error) {
    logger.error('Error in revert endpoint', {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      createErrorResponse({
        type: 'unknown',
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: { message: error instanceof Error ? error.message : 'Unknown error' },
        recoverable: true
      }),
      { status: 500, headers: corsHeaders }
    );
  }
}
