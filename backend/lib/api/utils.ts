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
 * @returns Standardized NextResponse
 */
export function handleError(error: unknown, routeName: string): NextResponse<ErrorResponse> {
  const corsHeaders = getCorsHeaders();

  if (error instanceof AppError) {
    return NextResponse.json(
      { success: false, error: error.toApiError() },
      { status: error.statusCode, headers: corsHeaders }
    );
  }

  if (error instanceof ZodError) {
    const appError = AppError.validation('Request validation failed', {
      issues: error.issues,
    });
    return NextResponse.json(
      { success: false, error: appError.toApiError() },
      { status: appError.statusCode, headers: corsHeaders }
    );
  }

  // Handle generic errors
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Error in ${routeName}`, { error: message });

  const appError = AppError.unknown('An unexpected error occurred', {
    originalError: message,
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
 * @returns NextResponse with data and CORS headers
 */
export function jsonResponse<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status, headers: getCorsHeaders() });
}
