/**
 * Route Context Middleware
 * Provides automatic request ID generation, context logger injection,
 * rate limit header merging, and request/response logging for API routes.
 */

import type { NextRequest } from 'next/server';
import { createLogger, type Logger } from '../logger';
import { generateRequestId } from '../request-id';

export interface RouteContext {
  requestId: string;
  contextLogger: Logger;
  /** Set rate limit headers to be merged into the final response. */
  setRateLimitHeaders: (headers: Record<string, string>) => void;
}

/**
 * Creates a request context with a generated request ID and a correlated logger.
 * Use this at the top of every route handler to enable request tracing.
 */
export function createRouteContext(module: string): RouteContext & { _rateLimitHeaders: Record<string, string> } {
  const requestId = generateRequestId();
  const contextLogger = createLogger(module).withRequestId(requestId);
  const ctx = {
    requestId,
    contextLogger,
    _rateLimitHeaders: {} as Record<string, string>,
    setRateLimitHeaders(headers: Record<string, string>) {
      ctx._rateLimitHeaders = headers;
    },
  };
  return ctx;
}

/**
 * Higher-order function that wraps a Next.js route handler with automatic
 * request ID generation, context logger injection, rate limit header merging,
 * request/response logging, and X-Request-Id response header.
 *
 * @example
 * export const POST = withRouteContext('api/my-route', async (ctx, request) => {
 *   const { blocked, headers } = applyRateLimit(request, RateLimitTier.HIGH_COST);
 *   ctx.setRateLimitHeaders(headers);
 *   if (blocked) return blocked as Response;
 *   // ... handle request
 * });
 */
export function withRouteContext(
  module: string,
  handler: (ctx: RouteContext, request: NextRequest) => Promise<Response>
): (request: NextRequest) => Promise<Response> {
  return async (request: NextRequest): Promise<Response> => {
    const start = Date.now();
    const ctx = createRouteContext(module);

    const response = await handler(ctx, request);

    // Merge X-Request-Id and rate limit headers into the response
    const headers = new Headers(response.headers);
    if (!headers.get('X-Request-Id')) {
      headers.set('X-Request-Id', ctx.requestId);
    }
    for (const [key, value] of Object.entries(ctx._rateLimitHeaders)) {
      if (!headers.get(key)) {
        headers.set(key, value);
      }
    }

    // Log request/response summary
    const durationMs = Date.now() - start;
    ctx.contextLogger.info('Request completed', {
      method: request.method,
      path: new URL(request.url).pathname,
      status: response.status,
      durationMs,
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
