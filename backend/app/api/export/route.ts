/**
 * Export Project API Endpoint
 * POST /api/export
 * 
 * Accepts a project state and returns a downloadable ZIP file.
 * Implements Requirement 10.5
 */

import { NextRequest, NextResponse } from 'next/server';
import type { ErrorResponse } from '@ai-app-builder/shared';
import { deserializeProjectState, ExportProjectRequestSchema } from '@ai-app-builder/shared';
import { exportAsZipBuffer } from '../../../lib/core';
import { getCorsHeaders, handleOptions, handleError, AppError } from '../../../lib/api';
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
    const body = await request.json();

    // Validate request
    const validatedRequest = ExportProjectRequestSchema.parse(body);

    // Deserialize project state
    const projectState = deserializeProjectState(validatedRequest.projectState as any);

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
    return handleError(error, 'api/export');
  }
}
