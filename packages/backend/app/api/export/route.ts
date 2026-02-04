/**
 * Export Project API Endpoint
 * POST /api/export
 * 
 * Accepts a project state and returns a downloadable ZIP file.
 * Implements Requirement 10.5
 */

import { NextRequest, NextResponse } from 'next/server';
import type { ExportProjectRequest, ErrorResponse } from '@ai-app-builder/shared';
import { deserializeProjectState } from '@ai-app-builder/shared';
import { exportAsZipBuffer } from '../../../lib/core';
import { ExportProjectRequestSchema } from '../../../lib/api/schemas';
import { getCorsHeaders, handleOptions, createErrorResponse } from '../../../lib/api';
import { createLogger } from '../../../lib/logger';

const logger = createLogger('api/export');

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const corsHeaders = getCorsHeaders();
  
  try {
    // Parse request body
    let body: ExportProjectRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        createErrorResponse({ type: 'api', code: 'INVALID_REQUEST_BODY', message: 'Invalid JSON in request body' }),
        { status: 400, headers: corsHeaders }
      );
    }

    const parsedRequest = ExportProjectRequestSchema.safeParse(body);
    if (!parsedRequest.success) {
      const issue = parsedRequest.error.issues[0];
      return NextResponse.json(
        createErrorResponse({
          type: 'api',
          code: 'INVALID_PROJECT_STATE',
          message: issue?.message ?? 'Project state validation failed',
          details: { issues: parsedRequest.error.issues },
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Deserialize project state
    const projectState = deserializeProjectState(parsedRequest.data.projectState);

    // Generate ZIP file
    const zipBuffer = await exportAsZipBuffer(projectState);

    // Generate filename from project name
    const sanitizedName = projectState.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'project';
    const filename = `${sanitizedName}.zip`;

    // Return ZIP file as binary download
    // Convert Buffer to Uint8Array for NextResponse compatibility
    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': zipBuffer.length.toString(),
      },
    });

  } catch (error) {
    logger.error('Error in export endpoint', {
      error: error instanceof Error ? error.message : String(error),
    });
    
    return NextResponse.json(
      createErrorResponse({
        type: 'unknown',
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while exporting project',
        details: { message: error instanceof Error ? error.message : 'Unknown error' },
        recoverable: true
      }),
      { status: 500, headers: corsHeaders }
    );
  }
}
