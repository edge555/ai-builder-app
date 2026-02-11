/**
 * Shared API Utilities
 * 
 * Provides common utilities for API routes including CORS headers,
 * error response formatting, and response helpers.
 * 
 * Implements Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { NextResponse } from 'next/server';
import type { ErrorResponse } from '@ai-app-builder/shared';
import { config } from '../config';

/**
 * Options for creating an error response
 */
export interface ErrorResponseOptions {
  /** Category of the error */
  type: 'api' | 'validation' | 'ai_output' | 'state' | 'unknown';
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
 * 
 * @returns Record of CORS headers to include in responses
 */
export function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': config.cors.origin,
    'Access-Control-Allow-Methods': config.cors.methods.join(', '),
    'Access-Control-Allow-Headers': config.cors.headers.join(', '),
    'Access-Control-Allow-Credentials': 'true',
  };
}

/**
 * Creates a standardized error response.
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
 * @returns NextResponse with data and CORS headers
 */
export function jsonResponse<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status, headers: getCorsHeaders() });
}
