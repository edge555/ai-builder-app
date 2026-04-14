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
import { getCorsHeaders, handleOptions, handleError, AppError, gzipJson, parseJsonRequest } from '../../../lib/api';
import { generateRequestId } from '../../../lib/request-id';
import { createLogger } from '../../../lib/logger';
import { resolveWorkspaceRequestContext } from '../../../lib/security/workspace-request-context';

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
    const workspaceCtx = await resolveWorkspaceRequestContext(request, validatedRequest.workspaceId);
    if (workspaceCtx.authResponse) return workspaceCtx.authResponse;
    if (workspaceCtx.forbidden) {
      return new Response(
        JSON.stringify({ error: 'Not a member of this workspace' }),
        {
          status: 403,
          headers: {
            ...getCorsHeaders(request),
            ...rlHeaders,
            'Content-Type': 'application/json',
            'X-Request-Id': requestId,
          }
        }
      );
    }

    contextLogger.info('Generating project', {
      descriptionLength: validatedRequest.description.length,
      workspaceMode: !!workspaceCtx.workspaceProvider,
    });

    // Generate project using the same pipeline/beginnerMode path as generate-stream
    const generator = await createStreamingProjectGenerator(workspaceCtx.workspaceProvider);
    const result = await generator.generateProjectStreaming(
      validatedRequest.description,
      { signal: request.signal },
      { requestId, beginnerMode: workspaceCtx.beginnerMode }
    );

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

    return gzipJson(response, { status: 201, headers: { ...getCorsHeaders(request), ...rlHeaders, 'X-Request-Id': requestId }, request });

  } catch (error) {
    contextLogger.error('Project generation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return handleError(error, 'api/generate', request);
  }
}
