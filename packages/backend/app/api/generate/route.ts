/**
 * Generate Project API Endpoint
 * POST /api/generate
 * 
 * Accepts a project description and returns a complete generated project.
 * Implements Requirement 10.1
 */

import { NextRequest, NextResponse } from 'next/server';
import type { GenerateProjectRequest, GenerateProjectResponse, ErrorResponse } from '@ai-app-builder/shared';
import { serializeProjectState, serializeVersion } from '@ai-app-builder/shared';
import { createProjectGenerator } from '../../../lib/core';
import { getCorsHeaders, handleOptions, createErrorResponse } from '../../../lib/api';
import { createLogger } from '../../../lib/logger';

const logger = createLogger('api/generate');

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

export async function POST(request: NextRequest): Promise<NextResponse<GenerateProjectResponse | ErrorResponse>> {
  const corsHeaders = getCorsHeaders();
  
  try {
    // Parse request body
    let body: GenerateProjectRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        createErrorResponse({ type: 'api', code: 'INVALID_REQUEST_BODY', message: 'Invalid JSON in request body' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate request
    if (!body.description || typeof body.description !== 'string') {
      return NextResponse.json(
        createErrorResponse({ type: 'api', code: 'MISSING_DESCRIPTION', message: 'Project description is required' }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (body.description.trim().length === 0) {
      return NextResponse.json(
        createErrorResponse({ type: 'api', code: 'EMPTY_DESCRIPTION', message: 'Project description cannot be empty' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Generate project
    const generator = createProjectGenerator();
    const result = await generator.generateProject(body.description);

    if (!result.success) {
      // Determine error type based on the error
      const errorType = result.validationErrors ? 'validation' : 'ai_output';
      const errorCode = result.validationErrors ? 'VALIDATION_FAILED' : 'GENERATION_FAILED';
      
      return NextResponse.json(
        createErrorResponse({
          type: errorType,
          code: errorCode,
          message: result.error ?? 'Failed to generate project',
          details: result.validationErrors ? { validationErrors: result.validationErrors } : undefined
        }),
        { status: 422, headers: corsHeaders }
      );
    }

    // Return successful response
    const response: GenerateProjectResponse = {
      success: true,
      projectState: serializeProjectState(result.projectState!),
      version: serializeVersion(result.version!),
    };

    return NextResponse.json(response, { status: 201, headers: corsHeaders });

  } catch (error) {
    logger.error('Error in generate endpoint', {
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
