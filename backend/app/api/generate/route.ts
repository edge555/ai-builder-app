/**
 * Generate Project API Endpoint
 * POST /api/generate
 *
 * Accepts a project description and returns a complete generated project.
 * Implements Requirement 10.1
 */

import { NextRequest } from 'next/server';
import type { GenerateProjectResponse } from '@ai-app-builder/shared';
import { applyRateLimit, RateLimitTier } from '../../../lib/security';
import { serializeProjectState, serializeVersion, GenerateProjectRequestSchema } from '@ai-app-builder/shared';
import { createStreamingProjectGenerator } from '../../../lib/core/streaming-generator';
import { AppError, getCorsHeaders, handleOptions, gzipJson, parseJsonRequest } from '../../../lib/api';
import { generateRequestId } from '../../../lib/request-id';
import { createLogger } from '../../../lib/logger';
const logger = createLogger('api/generate');

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

export async function POST(request: NextRequest): Promise<Response> {
  const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.MEDIUM_COST);
  if (blocked) return blocked;

  // Generate request ID for correlation
  const requestId = generateRequestId();
  const contextLogger = logger.withRequestId(requestId);

  try {
    // CSRF: reject mutations with missing/invalid origin
    getCorsHeaders(request, { rejectInvalidOrigin: true });

    // Parse and validate request body
    const parsed = await parseJsonRequest(request, GenerateProjectRequestSchema);
    if (!parsed.ok) return parsed.response;
    const validatedRequest = parsed.data;

    contextLogger.info('Generating project', {
      descriptionLength: validatedRequest.description.length,
    });

    const generator = await createStreamingProjectGenerator();
    const result = await generator.generateProjectStreaming(
      validatedRequest.description,
      { signal: request.signal },
      { requestId }
    );

    if (!result.success) {
      const response: GenerateProjectResponse = {
        success: false,
        error: result.error ?? 'Failed to generate project',
        errorType: result.validationErrors ? 'validation' : 'ai_output',
        ...(result.qualityReport ? { qualityReport: result.qualityReport } : {}),
      };

      return gzipJson(response, {
        status: 422,
        headers: { ...getCorsHeaders(request), ...rlHeaders, 'X-Request-Id': requestId },
        request,
      });
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
      ...(result.qualityReport ? { qualityReport: result.qualityReport } : {}),
    };

    return gzipJson(response, { status: 201, headers: { ...getCorsHeaders(request), ...rlHeaders, 'X-Request-Id': requestId }, request });

  } catch (error) {
    if (error instanceof AppError) {
      const response: GenerateProjectResponse = {
        success: false,
        error: error.message,
        errorType: error.type,
      };
      return gzipJson(response, {
        status: error.statusCode,
        headers: { ...getCorsHeaders(request), ...rlHeaders, 'X-Request-Id': requestId },
        request,
      });
    }

    contextLogger.error('Project generation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    const response: GenerateProjectResponse = {
      success: false,
      error: 'Failed to generate project',
      errorType: 'ai_output',
    };
    return gzipJson(response, {
      status: 500,
      headers: { ...getCorsHeaders(request), ...rlHeaders, 'X-Request-Id': requestId },
      request,
    });
  }
}
