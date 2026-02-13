/**
 * Modify Project API Endpoint
 * POST /api/modify
 *
 * Accepts a project state and modification prompt, returns updated project.
 * Implements Requirement 10.2
 */

import { NextRequest, NextResponse } from 'next/server';
import type {
  ModifyProjectResponse,
  ErrorResponse,
} from '@ai-app-builder/shared';
import {
  serializeProjectState,
  serializeVersion,
  deserializeProjectState,
  ModifyProjectRequestSchema,
} from '@ai-app-builder/shared';
import { createModificationEngine } from '../../../lib/diff';
import { getCorsHeaders, handleOptions, handleError, AppError } from '../../../lib/api';
import { generateRequestId } from '../../../lib/request-id';
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
  // Generate request ID for correlation
  const requestId = generateRequestId();
  const contextLogger = logger.withRequestId(requestId);

  try {
    // Parse request body
    const body = await request.json();

    // Validate request
    const validatedRequest = ModifyProjectRequestSchema.parse(body);

    contextLogger.info('Modifying project', {
      promptLength: validatedRequest.prompt.length,
      skipPlanning: validatedRequest.skipPlanning,
    });

    // Deserialize project state
    const projectState = deserializeProjectState(validatedRequest.projectState as any);

    // Extract skipPlanning option from request
    const { skipPlanning } = validatedRequest;

    // Modify project
    const engine = createModificationEngine();
    // TODO: Pass requestId to engine when it supports it
    const result = await engine.modifyProject(projectState, validatedRequest.prompt, { skipPlanning });

    if (!result.success) {
      if (result.validationErrors) {
        throw AppError.validation(result.error ?? 'Validation failed', {
          validationErrors: result.validationErrors
        });
      }
      throw AppError.aiOutput(result.error ?? 'Failed to modify project');
    }

    // Return successful response
    const response: ModifyProjectResponse = {
      success: true,
      projectState: serializeProjectState(result.projectState!),
      version: serializeVersion(result.version!),
      diffs: result.diffs,
      changeSummary: result.changeSummary,
    };

    contextLogger.info('Project modification completed', {
      success: true,
      changedFiles: result.diffs?.length ?? 0,
    });

    return NextResponse.json(response, { status: 200, headers: getCorsHeaders(request) });
  } catch (error) {
    contextLogger.error('Project modification failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return handleError(error, 'api/modify', request);
  }
}
