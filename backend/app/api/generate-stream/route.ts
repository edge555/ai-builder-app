/**
 * Generate Project Streaming API Endpoint
 * POST /api/generate-stream
 * 
 * Streams project generation with incremental file emission via SSE.
 * Implements Phase 6: True Incremental Streaming
 */

import { NextRequest } from 'next/server';
import type { GenerateProjectRequest } from '@ai-app-builder/shared';
import { applyRateLimit, RateLimitTier } from '../../../lib/security';
import {
  serializeProjectState,
  serializeVersion,
  GenerateProjectRequestSchema
} from '@ai-app-builder/shared';
import { createStreamingProjectGenerator } from '../../../lib/core/streaming-generator';
import { handleOptions, getCorsHeaders, parseJsonRequest } from '../../../lib/api';
import { createLogger } from '../../../lib/logger';
import { generateRequestId } from '../../../lib/request-id';
import {
  BackpressureController,
  EventPriority,
  SSEEncoder,
  createStreamLifecycle,
} from '../../../lib/streaming';
import { createServiceRoleSupabaseClient } from '../../../lib/security/auth';
import { resolveWorkspaceRequestContext } from '../../../lib/security/workspace-request-context';
import { appendTurn, getLastKTurns, getOrCreateSession, type SessionTurn } from '../../../lib/session-service';

const logger = createLogger('api/generate-stream');

const HEARTBEAT_INTERVAL_MS = 10000; // 10 seconds
const STREAM_TIMEOUT_MS = 960000; // 16 minutes (Modal can take 10-15+ min for large generations)

function buildGenerationAssistantSynopsis(description: string, changedFiles: string[]): string {
  const trimmedDescription = description.trim().replace(/\s+/g, ' ');
  const base = trimmedDescription.length > 120
    ? `Generated project from prompt: ${trimmedDescription.slice(0, 120)}...`
    : `Generated project from prompt: ${trimmedDescription}`;
  const withFiles = changedFiles.length > 0
    ? `${base}. Files: ${changedFiles.join(', ')}`
    : base;
  return withFiles.slice(0, 200);
}

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

export async function POST(request: NextRequest) {
  const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.HIGH_COST);
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
    const body: GenerateProjectRequest = parsed.data;

    // Workspace mode: verify membership and resolve org API key
    const workspaceCtx = await resolveWorkspaceRequestContext(request, body.workspaceId);
    if (workspaceCtx.authResponse) return workspaceCtx.authResponse;
    if (workspaceCtx.forbidden) {
      return new Response(
        JSON.stringify({ error: 'Not a member of this workspace' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const workspaceProvider = workspaceCtx.workspaceProvider;
    const memberId = workspaceCtx.memberId;
    const beginnerMode = workspaceCtx.beginnerMode;
    const supabaseServiceClient = createServiceRoleSupabaseClient();

    let sessionId: string | null = null;
    let conversationHistoryPrefix: SessionTurn[] = [];
    if (body.workspaceId && body.projectId && memberId) {
      sessionId = await getOrCreateSession(body.workspaceId, body.projectId, memberId);
      if (sessionId) {
        conversationHistoryPrefix = await getLastKTurns(sessionId);
        appendTurn(sessionId, 'user', body.description);
      }
    }

    contextLogger.info('Starting streaming generation', {
      descriptionLength: body.description.length,
      workspaceMode: !!workspaceProvider,
      hasServerHistory: conversationHistoryPrefix.length > 0,
    });

    // Create backpressure controller
    const backpressure = new BackpressureController({
      maxBufferSize: 1024 * 1024, // 1MB
      highWaterMark: 16 * 1024, // 16KB
      debug: false, // Enable for debugging
    });

    // Create streaming response with highWaterMark for backpressure signaling
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new SSEEncoder(backpressure);
        const lifecycle = createStreamLifecycle(
          controller, encoder, backpressure, request.signal, contextLogger,
          { heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS, streamTimeoutMs: STREAM_TIMEOUT_MS }
        );
        const { isComplete, cleanup, safeClose, safeEnqueue } = lifecycle;

        if (isComplete()) return; // Already aborted

        try {

          // Generate project with streaming callbacks
          const generator = await createStreamingProjectGenerator(workspaceProvider);

          const result = await generator.generateProjectStreaming(body.description, {
            signal: request.signal,


            onStart: () => {
              // Start event has normal priority
              encoder.enqueueEvent(
                controller,
                'start',
                { timestamp: Date.now() },
                EventPriority.NORMAL
              );
            },

            onProgress: (length: number) => {
              // Progress events have normal priority
              encoder.enqueueEvent(
                controller,
                'progress',
                { length },
                EventPriority.NORMAL
              );
            },

            onFile: (data) => {
              // File events are critical and must not be dropped
              encoder.enqueueEvent(
                controller,
                'file',
                data,
                EventPriority.CRITICAL
              );
            },

            onWarning: (data) => {
              // Warning events have normal priority
              encoder.enqueueEvent(
                controller,
                'warning',
                data,
                EventPriority.NORMAL
              );
            },

            onStreamEnd: (summary) => {
              // Stream-end event is critical
              encoder.enqueueEvent(
                controller,
                'stream-end',
                summary,
                EventPriority.CRITICAL
              );
            },

            onComplete: (data) => {
              const selectedRecipe = data.selectedRecipeId ? { id: data.selectedRecipeId } : null;
              const response = {
                success: true,
                projectState: serializeProjectState(data.projectState),
                version: serializeVersion(data.version),
              };
              // Complete event is critical
              encoder.enqueueEvent(
                controller,
                'complete',
                response,
                EventPriority.CRITICAL
              );

              if (sessionId) {
                const changedFiles = Object.keys(data.projectState.files ?? {});
                const synopsis = buildGenerationAssistantSynopsis(body.description, changedFiles);
                appendTurn(sessionId, 'assistant', synopsis, { filesAffected: changedFiles });
              }

              if (body.workspaceId && memberId) {
                supabaseServiceClient?.from('generation_events').insert({
                  workspace_id: body.workspaceId,
                  member_id: memberId,
                  timestamp: new Date().toISOString(),
                  token_count: null,
                  repair_triggered: false,
                  recipe: selectedRecipe?.id ?? null,
                }).then(() => {}, () => {});
              }
            },

            onPipelineStage: (data) => {
              // Pipeline stage events have normal priority (perceived responsiveness)
              encoder.enqueueEvent(
                controller,
                'pipeline-stage',
                data,
                EventPriority.NORMAL
              );
            },

            onPhaseStart: (data) => {
              encoder.enqueueEvent(
                controller,
                'phase-start',
                data,
                EventPriority.NORMAL
              );
            },

            onPhaseComplete: (data) => {
              encoder.enqueueEvent(
                controller,
                'phase-complete',
                data,
                EventPriority.NORMAL
              );
            },

            onError: (error, errorData) => {
              // Error events are critical
              encoder.enqueueEvent(
                controller,
                'error',
                {
                  error,
                  errorCode: errorData?.errorCode,
                  errorType: errorData?.errorType,
                  partialContent: errorData?.partialContent,
                },
                EventPriority.CRITICAL
              );
            },

            onHeartbeat: () => {
              // Additional heartbeat callback if needed
              encoder.enqueueHeartbeat(controller);
            },
          }, {
            requestId,
            beginnerMode,
            conversationHistoryPrefix,
          });

          // If already aborted, skip final messages
          if (isComplete()) return;

          // If generation failed without calling onError
          if (!result.success && result.error) {
            encoder.enqueueEvent(
              controller,
              'error',
              {
                error: result.error,
                validationErrors: result.validationErrors,
              },
              EventPriority.CRITICAL
            );
          }

          safeClose();

          contextLogger.info('Streaming generation completed', {
            success: result.success,
          });

        } catch (error) {
          // If already cleaned up (client disconnect), just log and return
          if (isComplete()) {
            contextLogger.info('Stream already closed (client disconnected)');
            return;
          }

          cleanup();

          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          contextLogger.error('Streaming generation error', { error: errorMessage });

          // Error events are critical
          encoder.enqueueEvent(
            controller,
            'error',
            { error: errorMessage },
            EventPriority.CRITICAL
          );
          controller.close();
        }
      },
    }, {
      // Set high water mark for proper backpressure signaling
      highWaterMark: backpressure.getHighWaterMark(),
    });

    // Return SSE response
    return new Response(stream, {
      headers: {
        ...getCorsHeaders(request),
        ...rlHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Request-Id': requestId,
      },
    });

  } catch (error) {
    contextLogger.error('Error in generate-stream endpoint', {
      error: error instanceof Error ? error.message : String(error),
    });

    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
      }
    );
  }
}

