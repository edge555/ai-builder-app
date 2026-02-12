/**
 * Modify Project API Endpoint
 * POST /api/modify
 * 
 * Accepts a project state and modification prompt, returns updated project.
 * Implements Requirement 10.2
 */

import { NextRequest, NextResponse } from 'next/server';
import type {
  ModifyProjectRequest,
  ModifyProjectResponse,
  ErrorResponse,
} from '@ai-app-builder/shared';
import {
  serializeProjectState,
  serializeVersion,
  deserializeProjectState,
} from '@ai-app-builder/shared';
import { createModificationEngine } from '../../../lib/diff';
import { ModifyProjectRequestSchema } from '../../../lib/api/schemas';
import { getCorsHeaders, handleOptions, createErrorResponse } from '../../../lib/api';
import { createLogger } from '../../../lib/logger';

const logger = createLogger('api/modify');

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<ModifyProjectResponse | ErrorResponse>> {
  const corsHeaders = getCorsHeaders();

  try {
    // Parse request body
    let body: ModifyProjectRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        createErrorResponse({ type: 'api', code: 'INVALID_REQUEST_BODY', message: 'Invalid JSON in request body' }),
        { status: 400, headers: corsHeaders }
      );
    }

    const parsedRequest = ModifyProjectRequestSchema.safeParse(body);
    if (!parsedRequest.success) {
      const issue = parsedRequest.error.issues[0];
      const isProjectState = issue?.path[0] === 'projectState';
      const errorCode = isProjectState ? 'INVALID_PROJECT_STATE' : 'INVALID_REQUEST_BODY';
      return NextResponse.json(
        createErrorResponse({
          type: 'api',
          code: errorCode,
          message: issue?.message ?? 'Request body validation failed',
          details: { issues: parsedRequest.error.issues },
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    const validatedRequest = parsedRequest.data;

    // Deserialize project state
    const projectState = deserializeProjectState(validatedRequest.projectState as any);

    // Extract skipPlanning option from request
    const { skipPlanning } = validatedRequest;

    // Modify project
    const engine = createModificationEngine();
    const result = await engine.modifyProject(projectState, validatedRequest.prompt, { skipPlanning });

    if (!result.success) {
      // Determine error type based on the error
      const errorType = result.validationErrors ? 'validation' : 'ai_output';
      const errorCode = result.validationErrors ? 'VALIDATION_FAILED' : 'MODIFICATION_FAILED';

      return NextResponse.json(
        createErrorResponse({
          type: errorType,
          code: errorCode,
          message: result.error ?? 'Failed to modify project',
          details: result.validationErrors ? { validationErrors: result.validationErrors } : undefined
        }),
        { status: 422, headers: corsHeaders }
      );
    }

    // Return successful response
    const response: ModifyProjectResponse = {
      success: true,
      projectState: serializeProjectState(result.projectState!),
      version: serializeVersion(result.version!),
      diffs: result.diffs,
      changeSummary: result.changeSummary,
    };

    return NextResponse.json(response, { status: 200, headers: corsHeaders });
  } catch (error) {
    logger.error('Error in modify endpoint', {
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
