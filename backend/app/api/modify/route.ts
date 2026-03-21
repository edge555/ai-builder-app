/**
 * Modify Project API Endpoint
 * POST /api/modify
 *
 * Accepts a project state and modification prompt, returns updated project.
 * Implements Requirement 10.2
 */

import { NextRequest } from 'next/server';
import { applyRateLimit, RateLimitTier } from '../../../lib/security';
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
import { getCorsHeaders, handleOptions, handleError, AppError, withTimeout, TimeoutError, gzipJson, parseJsonRequest } from '../../../lib/api';
import { generateRequestId } from '../../../lib/request-id';
import { createLogger } from '../../../lib/logger';

const logger = createLogger('api/modify');

// Timeout for modify operations (120 seconds for AI generation)
const MODIFY_TIMEOUT_MS = 120_000;

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

export async function POST(
  request: NextRequest
): Promise<Response> {
  const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.MEDIUM_COST);
  if (blocked) return blocked;

  // Generate request ID for correlation
  const requestId = generateRequestId();
  const contextLogger = logger.withRequestId(requestId);

  try {
    // CSRF: reject mutations with missing/invalid origin
    getCorsHeaders(request, { rejectInvalidOrigin: true });

    // Parse and validate request body
    const parsed = await parseJsonRequest(request, ModifyProjectRequestSchema);
    if (!parsed.ok) return parsed.response;
    const validatedRequest = parsed.data;

    contextLogger.info('Modifying project', {
      promptLength: validatedRequest.prompt.length,
      shouldSkipPlanning: validatedRequest.shouldSkipPlanning,
    });

    // Deserialize project state
    const projectState = deserializeProjectState(validatedRequest.projectState);

    // Extract shouldSkipPlanning, errorContext, and conversationHistory from request
    const { shouldSkipPlanning, errorContext, conversationHistory } = validatedRequest;

    // Modify project with timeout
    const engine = await createModificationEngine();
    const result = await withTimeout(
      engine.modifyProject(projectState, validatedRequest.prompt, { shouldSkipPlanning, errorContext, requestId, conversationHistory }),
      {
        timeoutMs: MODIFY_TIMEOUT_MS,
        operationName: 'project modification',
        signal: request.signal,
      }
    );

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
      ...(result.partialSuccess && { partialSuccess: true }),
      ...(result.rolledBackFiles?.length && { rolledBackFiles: result.rolledBackFiles }),
    };

    contextLogger.info('Project modification completed', {
      success: true,
      changedFiles: result.diffs?.length ?? 0,
    });

    return gzipJson(response, { status: 200, headers: { ...getCorsHeaders(request), ...rlHeaders, 'X-Request-Id': requestId }, request });
  } catch (error) {
    // Handle timeout errors specifically
    if (error instanceof TimeoutError) {
      contextLogger.error('Project modification timed out', {
        timeoutMs: error.timeoutMs,
      });
      const timeoutError = AppError.network(
        'OPERATION_TIMEOUT',
        // Convert milliseconds to seconds (1000ms = 1s) for human-readable message
        `Project modification timed out after ${error.timeoutMs / 1000} seconds`,
        { timeoutMs: error.timeoutMs },
        504
      );
      return handleError(timeoutError, 'api/modify', request);
    }

    contextLogger.error('Project modification failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return handleError(error, 'api/modify', request);
  }
}
