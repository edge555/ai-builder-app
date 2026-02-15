/**
 * Shared API Utilities
 * 
 * Provides common utilities for API routes including CORS headers,
 * error response formatting, and response helpers.
 * 
 * Implements Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { ErrorResponse, ApiError } from '@ai-app-builder/shared';
import { sanitizeError } from '@ai-app-builder/shared';
import { config } from '../config';
import { AppError } from './error';
import { createLogger } from '../logger';

const logger = createLogger('api/utils');

/**
 * Options for creating an error response
 */
export interface ErrorResponseOptions {
  /** Category of the error */
  type: ApiError['type'];
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: Record<string, unknown>;
  /** Whether the error is recoverable (user can retry) */
  recoverable?: boolean;
}

/**
 * Gets CORS headers from configuration.
 * Validates the request origin against the allowed origins list.
 *
 * @param request - Optional request to check the Origin header
 * @returns Record of CORS headers to include in responses
 */
export function getCorsHeaders(request?: Request): Record<string, string> {
  const { allowedOrigins } = config.cors;

  // Get the origin from the request header
  const requestOrigin = request?.headers.get('origin');

  // Determine which origin to allow
  let allowedOrigin: string;

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    // If the request origin is in our allowed list, use it
    allowedOrigin = requestOrigin;
  } else if (allowedOrigins.length === 1) {
    // If there's only one allowed origin, use it (backward compatibility)
    allowedOrigin = allowedOrigins[0];
  } else {
    // For preflight requests without origin, or invalid origins, use the first allowed origin
    allowedOrigin = allowedOrigins[0];

    // Log warning if request origin doesn't match
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
 * Creates a standardized error response body.
 * 
 * @param options - Error response options
 * @returns Formatted error response object
 */
export function createErrorResponse(options: ErrorResponseOptions): ErrorResponse {
  return {
    success: false,
    error: {
      type: options.type,
      code: options.code,
      message: options.message,
      details: options.details,
      recoverable: options.recoverable ?? true,
    },
  };
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
 * Creates a JSON response with automatic CORS headers.
 *
 * @param data - Response data
 * @param status - HTTP status code (default: 200)
 * @param request - Optional request to validate CORS origin
 * @returns NextResponse with data and CORS headers
 */
export function jsonResponse<T>(data: T, status = 200, request?: Request): NextResponse<T> {
  return NextResponse.json(data, { status, headers: getCorsHeaders(request) });
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
export interface WithTimeoutOptions {
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
