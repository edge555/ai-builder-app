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

    logger.info('Starting streaming generation', {
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
          isComplete = true;
        };

        try {
          // Set up heartbeat to prevent proxy timeouts
          heartbeatInterval = setInterval(() => {
            if (!isComplete) {
              controller.enqueue(encoder.heartbeat());
            }
          }, HEARTBEAT_INTERVAL_MS);

          // Set up stream timeout
          streamTimeout = setTimeout(() => {
            if (!isComplete) {
              cleanup();
              controller.enqueue(encoder.encode('error', {
                error: 'Stream timeout after 120 seconds',
              }));
              controller.close();
            }
          }, STREAM_TIMEOUT_MS);

          // Generate project with streaming callbacks
          const generator = createStreamingProjectGenerator();

          const result = await generator.generateProjectStreaming(body.description, {
            onStart: () => {
              controller.enqueue(encoder.encode('start', { timestamp: Date.now() }));
            },

            onProgress: (length: number) => {
              controller.enqueue(encoder.encode('progress', { length }));
            },

            onFile: (data) => {
              controller.enqueue(encoder.encode('file', data));
            },

            onComplete: (data) => {
              const response = {
                success: true,
                projectState: serializeProjectState(data.projectState),
                version: serializeVersion(data.version),
              };
              controller.enqueue(encoder.encode('complete', response));
            },

            onError: (error) => {
              controller.enqueue(encoder.encode('error', { error }));
            },

            onHeartbeat: () => {
              // Additional heartbeat callback if needed
            },
          });

          // If generation failed without calling onError
          if (!result.success && result.error) {
            controller.enqueue(encoder.encode('error', {
              error: result.error,
              validationErrors: result.validationErrors,
            }));
          }

          cleanup();
          controller.close();

          logger.info('Streaming generation completed', {
            success: result.success,
          });

        } catch (error) {
          cleanup();

          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error('Streaming generation error', { error: errorMessage });

          controller.enqueue(encoder.encode('error', { error: errorMessage }));
          controller.close();
        }
      },
    });

    // Return SSE response
    return new Response(stream, {
      headers: {
        ...getCorsHeaders(),
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    logger.error('Error in generate-stream endpoint', {
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
