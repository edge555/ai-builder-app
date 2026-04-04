/**
 * Shared API Utilities
 *
 * Provides common utilities for API routes including CORS headers,
 * error response formatting, and response helpers.
 *
 * Implements Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { gzip } from 'zlib';
import { promisify } from 'util';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { ErrorResponse } from '@ai-app-builder/shared/types';
import { sanitizeError, stateError } from '@ai-app-builder/shared/utils';
import { config } from '../config';
import { AppError } from './error';
import { createLogger } from '../logger';

const logger = createLogger('api/utils');
const gzipAsync = promisify(gzip);

/** Methods that mutate state and require origin validation for CSRF protection. */
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Gets CORS headers from configuration.
 * Validates the request origin against the allowed origins list.
 *
 * When `rejectInvalidOrigin` is true and the request is a mutation (POST/PUT/PATCH/DELETE),
 * throws AppError with 403 status if the Origin header is missing or not in ALLOWED_ORIGINS.
 * This provides CSRF protection for SPA-to-API calls.
 *
 * @param request - Optional request to check the Origin header
 * @param options - Optional settings for origin validation
 * @returns Record of CORS headers to include in responses
 * @throws {AppError} When rejectInvalidOrigin is true and origin is invalid on mutation
 */
export function getCorsHeaders(
  request?: Request,
  options?: { rejectInvalidOrigin?: boolean }
): Record<string, string> {
  const { allowedOrigins } = config.cors;
  const requestOrigin = request?.headers.get('origin');
  const method = request?.method?.toUpperCase();

  // CSRF protection: reject mutations with missing/invalid origin
  if (options?.rejectInvalidOrigin && method && MUTATION_METHODS.has(method)) {
    if (!requestOrigin || !allowedOrigins.includes(requestOrigin)) {
      throw new AppError({
        type: 'api',
        code: 'ORIGIN_REJECTED',
        message: 'Request origin is not allowed',
        details: { origin: requestOrigin ?? 'missing' },
        recoverable: false,
        statusCode: 403,
      });
    }
  }

  // Determine which origin to allow in CORS response
  let allowedOrigin: string;

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    allowedOrigin = requestOrigin;
  } else if (allowedOrigins.length === 1) {
    allowedOrigin = allowedOrigins[0];
  } else {
    allowedOrigin = allowedOrigins[0];

    if (requestOrigin) {
      logger.warn('Request origin not in allowed list', {
        requestOrigin,
        allowedOrigins,
      });
    }
  }

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': config.cors.methods.join(', '),
    'Access-Control-Allow-Headers': config.cors.headers.join(', '),
    'Access-Control-Allow-Credentials': 'true',
  };
}

/**
 * Returns a JSON error response with CORS headers included.
 * Use this for all early-return error responses in route handlers.
 */
export function corsError(request: Request, message: string, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...getCorsHeaders(request), ...extraHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Centralized error handler for API routes.
 * Converts any error into a standardized NextResponse with ErrorResponse body.
 *
 * @param error - The error to handle
 * @param routeName - Name of the route for logging
 * @param request - Optional request to validate CORS origin
 * @returns Standardized NextResponse
 */
export function handleError(
  error: unknown,
  routeName: string,
  request?: Request
): NextResponse<ErrorResponse> {
  const corsHeaders = getCorsHeaders(request);

  if (error instanceof AppError) {
    return NextResponse.json(
      { success: false, error: error.toApiError() },
      { status: error.statusCode, headers: corsHeaders }
    );
  }

  if (error instanceof ZodError) {
    // Sanitize issues to only include serializable properties
    const sanitizedIssues = error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));

    const appError = AppError.validation('Request validation failed', {
      issues: sanitizedIssues,
    });
    return NextResponse.json(
      { success: false, error: appError.toApiError() },
      { status: appError.statusCode, headers: corsHeaders }
    );
  }

  // Handle generic errors
  const message = error instanceof Error ? error.message : String(error);
  const sanitizedMessage = sanitizeError(message);
  logger.error(`Error in ${routeName}`, { error: sanitizedMessage });

  const appError = AppError.unknown('An unexpected error occurred', {
    originalError: sanitizedMessage,
  });

  return NextResponse.json(
    { success: false, error: appError.toApiError() },
    { status: 500, headers: corsHeaders }
  );
}

/**
 * Handles OPTIONS preflight requests.
 * 
 * @returns NextResponse with CORS headers and 204 status
 */
export function handleOptions(): NextResponse {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}

/**
 * Options for gzipJson.
 */
interface GzipJsonOptions {
  /** HTTP status code (default: 200) */
  status?: number;
  /** Extra headers to include alongside CORS and compression headers */
  headers?: Record<string, string>;
  /** The incoming request — used for CORS and to check Accept-Encoding */
  request?: Request;
}

/**
 * Returns a gzip-compressed JSON response when the client supports it.
 *
 * Next.js `compress: true` in next.config.js only applies to page/static
 * responses, NOT to App Router Route Handlers that return a raw NextResponse.
 * This helper fills that gap for large JSON payloads (e.g. /api/modify,
 * /api/generate) where the savings are most significant.
 *
 * Falls back to plain `NextResponse.json()` if the client doesn't advertise
 * `Accept-Encoding: gzip` or if gzip fails.
 *
 * @param data    - Serialisable response body
 * @param options - Status, extra headers, and the incoming request
 */
export async function gzipJson<T>(
  data: T,
  options: GzipJsonOptions = {}
): Promise<Response> {
  const { status = 200, headers: extraHeaders = {}, request } = options;
  const corsHeaders = getCorsHeaders(request);

  // Only compress if the client advertises gzip support
  const acceptEncoding = request?.headers.get('accept-encoding') ?? '';
  const clientAcceptsGzip = acceptEncoding.includes('gzip');

  if (clientAcceptsGzip) {
    try {
      const json = JSON.stringify(data);
      const compressed = await gzipAsync(Buffer.from(json, 'utf-8'));

      return new Response(compressed, {
        status,
        headers: {
          ...corsHeaders,
          ...extraHeaders,
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip',
          'Vary': 'Accept-Encoding',
        },
      });
    } catch (error) {
      logger.warn('gzip compression failed, falling back to uncompressed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Fallback: plain JSON
  return NextResponse.json(data, {
    status,
    headers: { ...corsHeaders, ...extraHeaders, 'Vary': 'Accept-Encoding' },
  }) as Response;
}

/**
 * Timeout error thrown when a promise exceeds its time limit
 */
export class TimeoutError extends Error {
  constructor(message: string, public readonly timeoutMs: number) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Options for withTimeout
 */
interface WithTimeoutOptions {
  /** Timeout duration in milliseconds */
  timeoutMs: number;
  /** Optional cleanup function to call on timeout */
  onTimeout?: () => void | Promise<void>;
  /** Optional AbortSignal to abort the operation externally */
  signal?: AbortSignal;
  /** Operation name for error messages */
  operationName?: string;
}

/**
 * Wraps a promise with a timeout.
 * Throws TimeoutError if the promise doesn't resolve within the specified time.
 * Optionally accepts an AbortSignal for external cancellation.
 *
 * @param promise - The promise to wrap
 * @param options - Timeout options
 * @returns The promise result or throws TimeoutError
 *
 * @example
 * ```ts
 * const result = await withTimeout(
 *   longRunningOperation(),
 *   {
 *     timeoutMs: 30000,
 *     operationName: 'diff computation',
 *     onTimeout: () => cleanup()
 *   }
 * );
 * ```
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  options: WithTimeoutOptions
): Promise<T> {
  const { timeoutMs, onTimeout, signal, operationName = 'operation' } = options;

  // If external signal is already aborted, reject immediately
  if (signal?.aborted) {
    throw new Error(`${operationName} was aborted before starting`);
  }

  let timeoutId: NodeJS.Timeout | null = null;
  let cleanupCalled = false;
  let didTimeout = false;

  const cleanup = async () => {
    if (cleanupCalled) return;
    cleanupCalled = true;

    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    // Only call onTimeout callback if we actually timed out or aborted
    if (didTimeout && onTimeout) {
      try {
        await onTimeout();
      } catch (error) {
        logger.error('Error during timeout cleanup', {
          operationName,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  };

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      const error = new TimeoutError(
        `${operationName} timed out after ${timeoutMs}ms`,
        timeoutMs
      );
      cleanup().then(() => reject(error));
    }, timeoutMs);
  });

  // Handle external abort signal
  const abortPromise = signal
    ? new Promise<never>((_, reject) => {
      if (signal.aborted) {
        reject(new Error(`${operationName} was aborted`));
        return;
      }
      signal.addEventListener('abort', () => {
        didTimeout = true; // Treat abort like timeout for cleanup
        cleanup().then(() => reject(new Error(`${operationName} was aborted`)));
      });
    })
    : null;

  try {
    const promises = [promise, timeoutPromise];
    if (abortPromise) promises.push(abortPromise);

    const result = await Promise.race(promises);
    // Clear timeout on success, but don't call onTimeout callback
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    return result as T;
  } catch (error) {
    await cleanup();
    throw error;
  }
}
