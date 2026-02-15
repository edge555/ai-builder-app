/**
 * Generate Project Streaming API Endpoint
 * POST /api/generate-stream
 * 
 * Streams project generation with incremental file emission via SSE.
 * Implements Phase 6: True Incremental Streaming
 */

import { NextRequest } from 'next/server';
import type { GenerateProjectRequest } from '@ai-app-builder/shared';
import { serializeProjectState, serializeVersion } from '@ai-app-builder/shared';
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
const STREAM_TIMEOUT_MS = 120000; // 120 seconds

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
    let body: GenerateProjectRequest;
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON in request body', { status: 400 });
    }

    // Validate request
    if (!body.description || typeof body.description !== 'string') {
      return new Response('Project description is required', { status: 400 });
    }

    if (body.description.trim().length === 0) {
      return new Response('Project description cannot be empty', { status: 400 });
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
          isComplete = true;

          // Log backpressure statistics
          backpressure.logStats();
        };

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
          const generator = createStreamingProjectGenerator();

          const result = await generator.generateProjectStreaming(body.description, {
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
          });

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

          cleanup();
          controller.close();

          contextLogger.info('Streaming generation completed', {
            success: result.success,
          });

        } catch (error) {
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
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
