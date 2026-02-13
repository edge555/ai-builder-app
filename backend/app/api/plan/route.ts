/**
 * Plan Project API Endpoint
 * POST /api/plan
 *
 * Accepts file metadata and a modification prompt, returns which files
 * are needed for the modification (primary files and context files).
 * This enables a metadata-first approach that reduces network payload.
 *
 * Requirements: 2.1, 2.2, 2.4, 2.5, 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { NextRequest, NextResponse } from 'next/server';
import type {
  PlanProjectResponse,
  PlanningMetadata,
  ErrorResponse,
} from '@ai-app-builder/shared';
import { PlanProjectRequestSchema } from '@ai-app-builder/shared';
import { createMetadataFilePlanner } from '../../../lib/analysis';
import { getCorsHeaders, handleOptions, handleError } from '../../../lib/api';
import { generateRequestId } from '../../../lib/request-id';
import { createLogger } from '../../../lib/logger';

const logger = createLogger('api/plan');

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<PlanProjectResponse | ErrorResponse>> {
  // Generate request ID for correlation
  const requestId = generateRequestId();
  const contextLogger = logger.withRequestId(requestId);
  const startTime = Date.now();

  try {
    // Parse request body
    const body = await request.json();

    // Validate request
    const validatedRequest = PlanProjectRequestSchema.parse(body);

    contextLogger.info('Planning project modification', {
      promptLength: validatedRequest.prompt.length,
      totalFiles: validatedRequest.fileTreeMetadata.length,
    });

    // Call MetadataFilePlanner.plan()
    const planner = createMetadataFilePlanner();
    // TODO: Pass requestId to planner when it supports it
    const planResult = await planner.plan(
      validatedRequest.prompt,
      validatedRequest.fileTreeMetadata,
      validatedRequest.projectName || 'project'
    );

    // Calculate timing metadata
    const planningTimeMs = Date.now() - startTime;

    // Build planning metadata
    const metadata: PlanningMetadata = {
      planningTimeMs,
      totalFiles: validatedRequest.fileTreeMetadata.length,
      primaryFileCount: planResult.primaryFiles.length,
      contextFileCount: planResult.contextFiles.length,
    };

    contextLogger.info('Planning completed', {
      planningTimeMs,
      primaryFiles: planResult.primaryFiles.length,
      contextFiles: planResult.contextFiles.length,
      usedFallback: planResult.usedFallback,
    });

    // Return successful response
    const response: PlanProjectResponse = {
      success: true,
      primaryFiles: planResult.primaryFiles,
      contextFiles: planResult.contextFiles,
      usedFallback: planResult.usedFallback,
      reasoning: planResult.reasoning,
      metadata,
    };

    return NextResponse.json(response, { status: 200, headers: getCorsHeaders(request) });
  } catch (error) {
    contextLogger.error('Planning failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return handleError(error, 'api/plan', request);
  }
}
