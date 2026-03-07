/**
 * Route Context Middleware
 * Provides automatic request ID generation and context logger injection for API routes.
 */

import type { NextRequest } from 'next/server';
import { createLogger, type Logger } from '../logger';
import { generateRequestId } from '../request-id';

export interface RouteContext {
  requestId: string;
  contextLogger: Logger;
}

/**
 * Creates a request context with a generated request ID and a correlated logger.
 * Use this at the top of every route handler to enable request tracing.
 *
 * @example
 * export async function POST(request: NextRequest) {
 *   const { requestId, contextLogger } = createRouteContext('api/my-route');
 *   contextLogger.info('Handling request');
 * }
 */
export function createRouteContext(module: string): RouteContext {
  const requestId = generateRequestId();
  const contextLogger = createLogger(module).withRequestId(requestId);
  return { requestId, contextLogger };
}

/**
 * Higher-order function that wraps a Next.js route handler with automatic
 * request ID generation, context logger injection, and X-Request-Id response header.
 *
 * @example
 * export const POST = withRouteContext('api/my-route', async ({ requestId, contextLogger }, request) => {
 *   contextLogger.info('Handling POST');
 *   return new Response('ok', { headers: { 'X-Request-Id': requestId } });
 * });
 */
export function withRouteContext(
  module: string,
  handler: (ctx: RouteContext, request: NextRequest) => Promise<Response>
): (request: NextRequest) => Promise<Response> {
  return async (request: NextRequest): Promise<Response> => {
    const ctx = createRouteContext(module);
    const response = await handler(ctx, request);
    // Attach X-Request-Id if not already present
    if (!response.headers.get('X-Request-Id')) {
      const headers = new Headers(response.headers);
      headers.set('X-Request-Id', ctx.requestId);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    return response;
  };
}
