/**
 * Generate Project Streaming API Endpoint
 * POST /api/generate-stream
 * 
 * Streams project generation with incremental file emission via SSE.
 * Implements Phase 6: True Incremental Streaming
 */

import { NextRequest } from 'next/server';
import type { GenerateProjectRequest } from '@ai-app-builder/shared';
import {
  serializeProjectState,
  serializeVersion,
  GenerateProjectRequestSchema
} from '@ai-app-builder/shared';
import { createStreamingProjectGenerator } from '../../../lib/core/streaming-generator';
import { handleOptions, getCorsHeaders } from '../../../lib/api';
import { createLogger } from '../../../lib/logger';
import { generateRequestId } from '../../../lib/request-id';
import {
  BackpressureController,
  EventPriority,
} from '../../../lib/streaming';

const logger = createLogger('api/generate-stream');

const HEARTBEAT_INTERVAL_MS = 10000; // 10 seconds
const STREAM_TIMEOUT_MS = 960000; // 16 minutes (Modal can take 10-15+ min for large generations)

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

/**
 * Server-Sent Events (SSE) encoder with backpressure support
 */
class SSEEncoder {
  private encoder = new TextEncoder();
  private backpressure: BackpressureController;

  constructor(backpressure: BackpressureController) {
    this.backpressure = backpressure;
  }

  /**
   * Encodes an SSE event
   */
  encode(event: string, data: any): Uint8Array {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    return this.encoder.encode(message);
  }

  /**
   * Encodes a heartbeat comment (keeps connection alive)
   */
  heartbeat(): Uint8Array {
    return this.encoder.encode(': heartbeat\n\n');
  }

  /**
   * Enqueue an event with backpressure handling
   */
  enqueueEvent(
    controller: ReadableStreamDefaultController<Uint8Array>,
    event: string,
    data: any,
    priority: EventPriority = EventPriority.NORMAL
  ): boolean {
    const encoded = this.encode(event, data);
    return this.backpressure.enqueue(controller, encoded, priority);
  }

  /**
   * Enqueue a heartbeat with low priority (can be dropped)
   */
  enqueueHeartbeat(
    controller: ReadableStreamDefaultController<Uint8Array>
  ): boolean {
    const encoded = this.heartbeat();
    return this.backpressure.enqueue(controller, encoded, EventPriority.LOW);
  }
}

export async function POST(request: NextRequest) {
  // Generate request ID for correlation
  const requestId = generateRequestId();
  const contextLogger = logger.withRequestId(requestId);

  try {
    // Parse request body
    // Parse request body
    let rawBody;
    try {
      rawBody = await request.json();
    } catch {
      return new Response('Invalid JSON in request body', { status: 400 });
    }

    // Validate request using strict schema
    let body: GenerateProjectRequest;
    try {
      body = GenerateProjectRequestSchema.parse(rawBody);
    } catch (error: any) {
      // Simple error formatting for Zod errors
      const message = error.errors ? error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') : 'Validation failed';
      return new Response(`Invalid request: ${message}`, { status: 400 });
    }

    contextLogger.info('Starting streaming generation', {
      descriptionLength: body.description.length,
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
        let heartbeatInterval: NodeJS.Timeout | null = null;
        let streamTimeout: NodeJS.Timeout | null = null;
        let isComplete = false;

        // Cleanup function
        const cleanup = () => {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          if (streamTimeout) clearTimeout(streamTimeout);
          heartbeatInterval = null;
          streamTimeout = null;
          isComplete = true;

          // Log backpressure statistics
          backpressure.logStats();
        };

        // Safe enqueue — guards against writing to a closed/errored controller
        const safeEnqueue = (data: Uint8Array) => {
          if (isComplete) return;
          try {
            controller.enqueue(data);
          } catch {
            // Controller already closed (client disconnected)
          }
        };

        // Safe close — guards against double-close
        const safeClose = () => {
          if (isComplete) return;
          cleanup();
          try {
            controller.close();
          } catch {
            // Controller already closed
          }
        };

        // Listen for client disconnect via request.signal
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
            // Already aborted before we started
            onAbort();
            return;
          }
          request.signal.addEventListener('abort', onAbort, { once: true });
        }

        try {
          // Set up heartbeat to prevent proxy timeouts
          heartbeatInterval = setInterval(() => {
            if (!isComplete) {
              // Heartbeat has low priority and can be dropped under backpressure
              encoder.enqueueHeartbeat(controller);
            }
          }, HEARTBEAT_INTERVAL_MS);

          // Set up stream timeout
          streamTimeout = setTimeout(() => {
            if (!isComplete) {
              cleanup();
              // Error events are critical
              encoder.enqueueEvent(
                controller,
                'error',
                { error: 'Stream timeout after 120 seconds' },
                EventPriority.CRITICAL
              );
              controller.close();
            }
          }, STREAM_TIMEOUT_MS);

          // Generate project with streaming callbacks
          const generator = await createStreamingProjectGenerator();

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
          }, { requestId });

          // If already aborted, skip final messages
          if (isComplete) return;

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
          if (isComplete) {
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
