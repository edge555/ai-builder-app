/**
 * Modify Project Streaming API Endpoint
 * POST /api/modify-stream
 *
 * Streams project modification results via SSE.
 * Calls ModificationEngine.modifyProject(), then emits each resulting file
 * as an SSE event for incremental preview updates.
 */

import { NextRequest } from 'next/server';
import {
  serializeProjectState,
  serializeVersion,
  deserializeProjectState,
  ModifyProjectRequestSchema,
} from '@ai-app-builder/shared';
import { createModificationEngine, type ModificationPhase } from '../../../lib/diff';
import { detectIntent } from '../../../lib/ai/ai-provider-factory';
import { handleOptions, getCorsHeaders } from '../../../lib/api';
import { createLogger } from '../../../lib/logger';
import { generateRequestId } from '../../../lib/request-id';
import {
  BackpressureController,
  EventPriority,
  SSEEncoder,
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
  const requestId = generateRequestId();
  const contextLogger = logger.withRequestId(requestId);

  try {
    // Parse request body
    let rawBody;
    try {
      rawBody = await request.json();
    } catch {
      return new Response('Invalid JSON in request body', { status: 400 });
    }

    // Validate request
    let body;
    try {
      body = ModifyProjectRequestSchema.parse(rawBody);
    } catch (error: any) {
      const message = error.errors
        ? error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')
        : 'Validation failed';
      return new Response(`Invalid request: ${message}`, { status: 400 });
    }

    contextLogger.info('Starting streaming modification', {
      promptLength: body.prompt.length,
      shouldSkipPlanning: body.shouldSkipPlanning,
    });

    // Deserialize project state
    const projectState = deserializeProjectState(body.projectState as any);
    const { shouldSkipPlanning } = body;

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
        let heartbeatInterval: NodeJS.Timeout | null = null;
        let streamTimeout: NodeJS.Timeout | null = null;
        let isComplete = false;

        const cleanup = () => {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          if (streamTimeout) clearTimeout(streamTimeout);
          heartbeatInterval = null;
          streamTimeout = null;
          isComplete = true;
          backpressure.logStats();
        };

        const safeClose = () => {
          if (isComplete) return;
          cleanup();
          try {
            controller.close();
          } catch {
            // Controller already closed
          }
        };

        const onAbort = () => {
          if (isComplete) return;
          contextLogger.info('Client disconnected, aborting SSE stream');
          cleanup();
          try {
            controller.close();
          } catch {
            // Controller already closed
          }
        };

        if (request.signal) {
          if (request.signal.aborted) {
            onAbort();
            return;
          }
          request.signal.addEventListener('abort', onAbort, { once: true });
        }

        try {
          // Heartbeat to prevent proxy timeouts
          heartbeatInterval = setInterval(() => {
            if (!isComplete) {
              encoder.enqueueHeartbeat(controller);
            }
          }, HEARTBEAT_INTERVAL_MS);

          // Stream timeout
          streamTimeout = setTimeout(() => {
            if (!isComplete) {
              cleanup();
              encoder.enqueueEvent(
                controller,
                'error',
                { error: `Stream timeout after ${STREAM_TIMEOUT_MS / 1000} seconds` },
                EventPriority.CRITICAL
              );
              controller.close();
            }
          }, STREAM_TIMEOUT_MS);

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
            requestId,
            onProgress: (phase: ModificationPhase, label: string) => {
              if (isComplete) return;
              encoder.enqueueEvent(
                controller,
                'progress',
                { phase, label },
                EventPriority.NORMAL
              );
            },
          });

          if (isComplete) return; // Client disconnected during modification

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
            if (isComplete) return;
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
          if (isComplete) {
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
