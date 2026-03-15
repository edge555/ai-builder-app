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
import { getCorsHeaders, handleOptions, handleError, AppError, withTimeout, TimeoutError, parseJsonRequest, withRouteContext } from '../../../lib/api';
import { EXPORT_TIMEOUT_MS } from '../../../lib/constants';

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

export const POST = withRouteContext('api/export', async (ctx, request: NextRequest) => {
  const { contextLogger } = ctx;
  const { blocked, headers: rlHeaders } = applyRateLimit(request, RateLimitTier.LOW_COST);
  ctx.setRateLimitHeaders(rlHeaders);
  if (blocked) return blocked as NextResponse;

  const corsHeaders = getCorsHeaders(request);

  const parsed = await parseJsonRequest(request, ExportProjectRequestSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const start = Date.now();

    // Deserialize project state
    const projectState = deserializeProjectState(parsed.data.projectState);

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

    contextLogger.info('Export complete', { durationMs: Date.now() - start, filename });

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
    if (error instanceof TimeoutError) {
      contextLogger.error('Export timed out', { timeoutMs: error.timeoutMs });
      const timeoutError = AppError.network(
        'OPERATION_TIMEOUT',
        `Project export timed out after ${error.timeoutMs / 1000} seconds`,
        { timeoutMs: error.timeoutMs },
        504
      );
      return handleError(timeoutError, 'api/export', request);
    }

    return handleError(error, 'api/export', request);
  }
});
