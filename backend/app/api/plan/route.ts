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
import { z } from 'zod';
import type {
  PlanProjectRequest,
  PlanProjectResponse,
  PlanningMetadata,
  ErrorResponse,
} from '@ai-app-builder/shared';
import { createMetadataFilePlanner } from '../../../lib/analysis';
import { getCorsHeaders, handleOptions, createErrorResponse } from '../../../lib/api';
import { createLogger } from '../../../lib/logger';

/** Maximum allowed prompt length in characters */
const MAX_PROMPT_LENGTH = 10000;
const logger = createLogger('api/plan');

const FileMetadataEntrySchema = z.object({
  path: z.string().min(1, 'Each metadata entry must have a valid path field'),
  fileType: z.enum(['component', 'style', 'config', 'utility', 'hook', 'api_route', 'other']),
  lineCount: z.number().int().nonnegative(),
  exports: z.array(z.string()),
  imports: z.array(z.string()),
});

const PlanProjectRequestSchema = z.object({
  fileTreeMetadata: z
    .array(FileMetadataEntrySchema)
    .min(1, 'fileTreeMetadata cannot be empty'),
  projectName: z.string().optional(),
  projectDescription: z.string().optional(),
  prompt: z
    .string()
    .min(1, 'Prompt is required and cannot be empty')
    .max(MAX_PROMPT_LENGTH, `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`),
});

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

/**
 * Get HTTP status code for a given error code.
 */
function getErrorStatus(code: string): number {
  switch (code) {
    case 'MISSING_PROMPT':
    case 'EMPTY_PROJECT':
    case 'INVALID_METADATA':
    case 'INVALID_METADATA_ENTRY':
    case 'PROMPT_TOO_LONG':
      return 400;
    case 'PLANNING_FAILED':
      return 500;
    default:
      return 500;
  }
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<PlanProjectResponse | ErrorResponse>> {
  const corsHeaders = getCorsHeaders();
  const startTime = Date.now();

  try {
    // Parse request body
    let body: PlanProjectRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        createErrorResponse({
          type: 'api',
          code: 'INVALID_REQUEST_BODY',
          message: 'Invalid JSON in request body',
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    const parsedRequest = PlanProjectRequestSchema.safeParse(body);
    if (!parsedRequest.success) {
      const issue = parsedRequest.error.issues[0];
      let errorCode = 'INVALID_REQUEST_BODY';

      if (issue?.path[0] === 'prompt') {
        errorCode = issue.code === 'too_big' ? 'PROMPT_TOO_LONG' : 'MISSING_PROMPT';
      } else if (issue?.path[0] === 'fileTreeMetadata') {
        errorCode = issue.code === 'too_small' ? 'EMPTY_PROJECT' : 'INVALID_METADATA';
      }

      return NextResponse.json(
        createErrorResponse({
          type: 'api',
          code: errorCode,
          message: issue?.message ?? 'Request body validation failed',
          details: { issues: parsedRequest.error.issues },
        }),
        { status: getErrorStatus(errorCode), headers: corsHeaders }
      );
    }

    const validatedRequest = parsedRequest.data;

    // Call MetadataFilePlanner.plan()
    const planner = createMetadataFilePlanner();
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

    // Return successful response
    const response: PlanProjectResponse = {
      success: true,
      primaryFiles: planResult.primaryFiles,
      contextFiles: planResult.contextFiles,
      usedFallback: planResult.usedFallback,
      reasoning: planResult.reasoning,
      metadata,
    };

    return NextResponse.json(response, { status: 200, headers: corsHeaders });
  } catch (error) {
    logger.error('Error in plan endpoint', {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      createErrorResponse({
        type: 'unknown',
        code: 'PLANNING_FAILED',
        message: 'An error occurred during file planning',
        details: { message: error instanceof Error ? error.message : 'Unknown error' },
        recoverable: true,
      }),
      { status: 500, headers: corsHeaders }
    );
  }
}
