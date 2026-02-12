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

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<ModifyProjectResponse | ErrorResponse>> {
  try {
    // Parse request body
    const body = await request.json();

    // Validate request
    const validatedRequest = ModifyProjectRequestSchema.parse(body);

    // Deserialize project state
    const projectState = deserializeProjectState(validatedRequest.projectState as any);

    // Extract skipPlanning option from request
    const { skipPlanning } = validatedRequest;

    // Modify project
    const engine = createModificationEngine();
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

    return NextResponse.json(response, { status: 200, headers: getCorsHeaders() });
  } catch (error) {
    return handleError(error, 'api/modify');
  }
}
