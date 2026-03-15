/**
 * Modify Project Streaming API Endpoint
 * POST /api/modify-stream
 *
 * Streams project modification results via SSE.
 * Calls ModificationEngine.modifyProject(), then emits each resulting file
 * as an SSE event for incremental preview updates.
 */

import { NextRequest } from 'next/server';
import { applyRateLimit, RateLimitTier } from '../../../lib/security';
import {
  serializeProjectState,
  serializeVersion,
  deserializeProjectState,
  ModifyProjectRequestSchema,
} from '@ai-app-builder/shared';
import { createModificationEngine, type ModificationPhase } from '../../../lib/diff';
import { detectIntent } from '../../../lib/ai/ai-provider-factory';
import { handleOptions, getCorsHeaders, parseJsonRequest } from '../../../lib/api';
import { createLogger } from '../../../lib/logger';
import { generateRequestId } from '../../../lib/request-id';
import {
  BackpressureController,
  EventPriority,
  SSEEncoder,
  createStreamLifecycle,
} from '../../../lib/streaming';

const logger = createLogger('api/modify-stream');

const HEARTBEAT_INTERVAL_MS = 10000; // 10 seconds
const STREAM_TIMEOUT_MS = 960000; // 16 minutes

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

export async function POST(request: NextRequest) {
  const { blocked, headers: rlHeaders } = applyRateLimit(request, RateLimitTier.HIGH_COST);
  if (blocked) return blocked;

  const requestId = generateRequestId();
  const contextLogger = logger.withRequestId(requestId);

  try {
    // Parse and validate request body
    const parsed = await parseJsonRequest(request, ModifyProjectRequestSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    contextLogger.info('Starting streaming modification', {
      promptLength: body.prompt.length,
      shouldSkipPlanning: body.shouldSkipPlanning,
    });

    // Deserialize project state
    const projectState = deserializeProjectState(body.projectState);
    const { shouldSkipPlanning, errorContext } = body;

    // Detect intent for task-specific model routing
    const detectedTaskType = await detectIntent(body.prompt, requestId);
    contextLogger.info('Intent detected for modification', { taskType: detectedTaskType });

    // Create backpressure controller
    const backpressure = new BackpressureController({
      maxBufferSize: 1024 * 1024, // 1MB
      highWaterMark: 16 * 1024, // 16KB
      debug: false,
    });

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new SSEEncoder(backpressure);
        const lifecycle = createStreamLifecycle(
          controller, encoder, backpressure, request.signal, contextLogger,
          { heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS, streamTimeoutMs: STREAM_TIMEOUT_MS }
        );
        const { isComplete, cleanup, safeClose } = lifecycle;

        if (isComplete()) return; // Already aborted

        try {

          // Emit start event
          encoder.enqueueEvent(
            controller,
            'start',
            { timestamp: Date.now() },
            EventPriority.NORMAL
          );

          // Run modification engine (blocking call — emits files post-hoc)
          const engine = await createModificationEngine(detectedTaskType);
          const result = await engine.modifyProject(projectState, body.prompt, {
            shouldSkipPlanning,
            errorContext,
            requestId,
            onProgress: (phase: ModificationPhase, label: string) => {
              if (isComplete()) return;
              encoder.enqueueEvent(
                controller,
                'progress',
                { phase, label },
                EventPriority.NORMAL
              );
            },
          });

          if (isComplete()) return; // Client disconnected during modification

          if (!result.success) {
            encoder.enqueueEvent(
              controller,
              'error',
              {
                error: result.error ?? 'Failed to modify project',
                validationErrors: result.validationErrors,
              },
              EventPriority.CRITICAL
            );
            safeClose();
            return;
          }

          // Emit each modified file as a separate SSE event
          const files = result.projectState!.files;
          const filePaths = Object.keys(files);
          const totalFiles = filePaths.length;

          for (let i = 0; i < filePaths.length; i++) {
            if (isComplete()) return;
            const path = filePaths[i];
            encoder.enqueueEvent(
              controller,
              'file',
              {
                path,
                content: files[path],
                index: i,
                total: totalFiles,
                status: 'complete',
              },
              EventPriority.CRITICAL
            );
          }

          // Emit complete event with full modification result
          const response = {
            success: true,
            projectState: serializeProjectState(result.projectState!),
            version: serializeVersion(result.version!),
            diffs: result.diffs,
            changeSummary: result.changeSummary,
          };

          encoder.enqueueEvent(
            controller,
            'complete',
            response,
            EventPriority.CRITICAL
          );

          // Emit stream-end summary
          encoder.enqueueEvent(
            controller,
            'stream-end',
            {
              totalFiles,
              successfulFiles: totalFiles,
              failedFiles: 0,
              warnings: 0,
            },
            EventPriority.CRITICAL
          );

          safeClose();

          contextLogger.info('Streaming modification completed', {
            success: true,
            changedFiles: result.diffs?.length ?? 0,
            totalFiles,
          });
        } catch (error) {
          if (isComplete()) {
            contextLogger.info('Stream already closed (client disconnected)');
            return;
          }

          cleanup();

          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          contextLogger.error('Streaming modification error', { error: errorMessage });

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
      highWaterMark: backpressure.getHighWaterMark(),
    });

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
    contextLogger.error('Error in modify-stream endpoint', {
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
