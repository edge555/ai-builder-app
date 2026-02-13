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
import { generateRequestId } from '../../../lib/request-id';
import { createLogger } from '../../../lib/logger';

const logger = createLogger('api/generate');

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

export async function POST(request: NextRequest): Promise<NextResponse<GenerateProjectResponse | ErrorResponse>> {
  // Generate request ID for correlation
  const requestId = generateRequestId();
  const contextLogger = logger.withRequestId(requestId);

  try {
    // Parse request body
    const body = await request.json();

    // Validate request
    const validatedRequest = GenerateProjectRequestSchema.parse(body);

    contextLogger.info('Generating project', {
      descriptionLength: validatedRequest.description.length,
    });

    // Generate project
    const generator = createProjectGenerator();
    // TODO: Pass requestId to generator when it supports it
    const result = await generator.generateProject(validatedRequest.description);

    if (!result.success) {
      if (result.validationErrors) {
        throw AppError.validation(result.error ?? 'Validation failed', {
          validationErrors: result.validationErrors
        });
      }
      throw AppError.aiOutput(result.error ?? 'Failed to generate project');
    }

    contextLogger.info('Project generation completed', {
      success: true,
      fileCount: Object.keys(result.projectState?.files ?? {}).length,
    });

    // Return successful response
    const response: GenerateProjectResponse = {
      success: true,
      projectState: serializeProjectState(result.projectState!),
      version: serializeVersion(result.version!),
    };

    return NextResponse.json(response, { status: 201, headers: getCorsHeaders(request) });

  } catch (error) {
    contextLogger.error('Project generation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return handleError(error, 'api/generate', request);
  }
}
