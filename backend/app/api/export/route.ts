/**
 * Export Project API Endpoint
 * POST /api/export
 * 
 * Accepts a project state and returns a downloadable ZIP file.
 * Implements Requirement 10.5
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, RateLimitTier } from '../../../lib/security';
import { deserializeProjectState, ExportProjectRequestSchema } from '@ai-app-builder/shared';
import { exportAsZipBuffer } from '../../../lib/core';
import { getCorsHeaders, handleOptions, handleError, AppError, withTimeout, TimeoutError } from '../../../lib/api';
import { createLogger } from '../../../lib/logger';

const logger = createLogger('api/export');

// Timeout for export operations (60 seconds)
const EXPORT_TIMEOUT_MS = 60_000;

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const blocked = applyRateLimit(request, RateLimitTier.LOW_COST);
  if (blocked) return blocked as NextResponse;

  const corsHeaders = getCorsHeaders(request);

  try {
    // Parse request body
    const body = await request.json();

    // Validate request
    const validatedRequest = ExportProjectRequestSchema.parse(body);

    // Deserialize project state
    const projectState = deserializeProjectState(validatedRequest.projectState as any);

    // Generate ZIP file with timeout
    const zipBuffer = await withTimeout(
      exportAsZipBuffer(projectState),
      {
        timeoutMs: EXPORT_TIMEOUT_MS,
        operationName: 'project export',
        signal: request.signal,
      }
    );

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
    // Handle timeout errors specifically
    if (error instanceof TimeoutError) {
      logger.error('Export timed out', {
        timeoutMs: error.timeoutMs,
      });
      const timeoutError = AppError.network(
        'OPERATION_TIMEOUT',
        // Convert milliseconds to seconds (1000ms = 1s) for human-readable message
        `Project export timed out after ${error.timeoutMs / 1000} seconds`,
        { timeoutMs: error.timeoutMs },
        504
      );
      return handleError(timeoutError, 'api/export', request);
    }

    return handleError(error, 'api/export', request);
  }
}
