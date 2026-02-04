/**
 * Versions API Endpoint
 * GET /api/versions?projectId={projectId}
 * 
 * Returns a list of all versions for a project with metadata.
 * Implements Requirement 10.4
 */

import { NextRequest, NextResponse } from 'next/server';
import type { GetVersionsResponse, ErrorResponse } from '@ai-app-builder/shared';
import { serializeVersion } from '@ai-app-builder/shared';
import { getVersionManager } from '../../../lib/core';
import { getCorsHeaders, handleOptions, createErrorResponse } from '../../../lib/api';
import { createLogger } from '../../../lib/logger';

const logger = createLogger('api/versions');

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

export async function GET(request: NextRequest): Promise<NextResponse<GetVersionsResponse | ErrorResponse>> {
  const corsHeaders = getCorsHeaders();
  
  try {
    // Get projectId from query parameters
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    // Validate projectId
    if (!projectId) {
      return NextResponse.json(
        createErrorResponse({ type: 'api', code: 'MISSING_PROJECT_ID', message: 'Project ID is required as a query parameter' }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (projectId.trim().length === 0) {
      return NextResponse.json(
        createErrorResponse({ type: 'api', code: 'EMPTY_PROJECT_ID', message: 'Project ID cannot be empty' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Get versions from the version manager
    const versionManager = getVersionManager();
    const versions = versionManager.getAllVersions(projectId);

    // Serialize versions for JSON transport
    const serializedVersions = versions.map(serializeVersion);

    // Return successful response
    const response: GetVersionsResponse = {
      versions: serializedVersions,
    };

    return NextResponse.json(response, { status: 200, headers: corsHeaders });

  } catch (error) {
    logger.error('Error in versions endpoint', {
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
