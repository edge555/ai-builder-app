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
 * Server-Sent Events (SSE) encoder
 */
class SSEEncoder {
  private encoder = new TextEncoder();

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

    // Create streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new SSEEncoder();
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
              safeEnqueue(encoder.heartbeat());
            }
          }, HEARTBEAT_INTERVAL_MS);

          // Set up stream timeout
          streamTimeout = setTimeout(() => {
            if (!isComplete) {
              safeEnqueue(encoder.encode('error', {
                error: 'Stream timeout after 120 seconds',
              }));
              safeClose();
            }
          }, STREAM_TIMEOUT_MS);

          // Generate project with streaming callbacks
          const generator = createStreamingProjectGenerator();

          const result = await generator.generateProjectStreaming(body.description, {
            signal: request.signal,

            onStart: () => {
              safeEnqueue(encoder.encode('start', { timestamp: Date.now() }));
            },

            onProgress: (length: number) => {
              safeEnqueue(encoder.encode('progress', { length }));
            },

            onFile: (data) => {
              safeEnqueue(encoder.encode('file', data));
            },

            onComplete: (data) => {
              const response = {
                success: true,
                projectState: serializeProjectState(data.projectState),
                version: serializeVersion(data.version),
              };
              safeEnqueue(encoder.encode('complete', response));
            },

            onError: (error, errorData) => {
              safeEnqueue(encoder.encode('error', {
                error,
                errorCode: errorData?.errorCode,
                errorType: errorData?.errorType,
                partialContent: errorData?.partialContent,
              }));
            },

            onHeartbeat: () => {
              // Additional heartbeat callback if needed
            },
          });

          // If already aborted, skip final messages
          if (isComplete) return;

          // If generation failed without calling onError
          if (!result.success && result.error) {
            safeEnqueue(encoder.encode('error', {
              error: result.error,
              validationErrors: result.validationErrors,
            }));
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

          safeEnqueue(encoder.encode('error', { error: errorMessage }));
          safeClose();
        } finally {
          // Remove abort listener to prevent memory leak
          if (request.signal) {
            request.signal.removeEventListener('abort', onAbort);
          }
        }
      },
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
