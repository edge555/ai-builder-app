/**
 * Generate Project API Endpoint
 * POST /api/generate
 * 
 * Accepts a project description and returns a complete generated project.
 * Implements Requirement 10.1
 */

import { NextRequest, NextResponse } from 'next/server';
import type { GenerateProjectResponse, ErrorResponse } from '@ai-app-builder/shared';
import { serializeProjectState, serializeVersion, GenerateProjectRequestSchema } from '@ai-app-builder/shared';
import { createProjectGenerator } from '../../../lib/core';
import { getCorsHeaders, handleOptions, handleError, AppError } from '../../../lib/api';

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

export async function POST(request: NextRequest): Promise<NextResponse<GenerateProjectResponse | ErrorResponse>> {
  try {
    // Parse request body
    const body = await request.json();

    // Validate request
    const validatedRequest = GenerateProjectRequestSchema.parse(body);

    // Generate project
    const generator = createProjectGenerator();
    const result = await generator.generateProject(validatedRequest.description);

    if (!result.success) {
      if (result.validationErrors) {
        throw AppError.validation(result.error ?? 'Validation failed', {
          validationErrors: result.validationErrors
        });
      }
      throw AppError.aiOutput(result.error ?? 'Failed to generate project');
    }

    // Return successful response
    const response: GenerateProjectResponse = {
      success: true,
      projectState: serializeProjectState(result.projectState!),
      version: serializeVersion(result.version!),
    };

    return NextResponse.json(response, { status: 201, headers: getCorsHeaders() });

  } catch (error) {
    return handleError(error, 'api/generate');
  }
}
