/**
 * Versions API Endpoint
 * GET /api/versions?projectId={projectId}
 * 
 * Returns a list of all versions for a project with metadata.
 * Implements Requirement 10.4
 */

import { NextRequest, NextResponse } from 'next/server';
import type { GetVersionsResponse, ErrorResponse } from '@ai-app-builder/shared';
import { serializeVersion, GetVersionsRequestSchema } from '@ai-app-builder/shared';
import { getVersionManager } from '../../../lib/core';
import { getCorsHeaders, handleOptions, handleError } from '../../../lib/api';

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

export async function GET(request: NextRequest): Promise<NextResponse<GetVersionsResponse | ErrorResponse>> {
  try {
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

    // Return successful response
    const response: GetVersionsResponse = {
      versions: serializedVersions,
    };

    return NextResponse.json(response, { status: 200, headers: getCorsHeaders() });

  } catch (error) {
    return handleError(error, 'api/versions');
  }
}
