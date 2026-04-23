/**
 * @module ai/ai-error-utils
 * @description Shared AI error categorization and retry logic.
 * Used by all AI provider clients to consistently
 * classify errors into typed categories and determine retryability.
 *
 * Error categories: `timeout`, `cancelled`, `rate_limit`, `api_error`, `unknown`.
 * Only `rate_limit` and `api_error` errors trigger retries.
 *
 * @requires ./ai-provider - AIResponse error type reference
 */

import type { AIResponse } from './ai-provider';

type AIErrorType = AIResponse['errorType'];

/**
 * Categorizes an error into a type and code.
 * @param error The error to categorize
 * @param apiErrorPrefix Provider-specific prefix for API errors (e.g. 'openrouter api error')
 */
export function categorizeError(
  error: Error,
  apiErrorPrefix: string
): { errorType: AIErrorType; errorCode: string } {
  const message = error.message.toLowerCase();

  if (message.includes('timeout') || message.includes('timed out')) {
    return { errorType: 'timeout', errorCode: 'TIMEOUT' };
  }
  if (message.includes('cancel') || message.includes('abort')) {
    return { errorType: 'cancelled', errorCode: 'CANCELLED' };
  }
  if (message.includes('rate limit') || message.includes('rate_limit') || message.includes('429') || message.includes('quota')) {
    return { errorType: 'rate_limit', errorCode: 'RATE_LIMIT_EXCEEDED' };
  }
  if (
    message.includes('502') || message.includes('503') ||
    message.includes('bad gateway') || message.includes('service unavailable') ||
    message.includes('econnrefused') || message.includes('connection refused') ||
    message.includes('enotfound') || message.includes('fetch failed')
  ) {
    return { errorType: 'api_error', errorCode: 'PROVIDER_UNAVAILABLE' };
  }
  if (message.includes(apiErrorPrefix) || /5\d{2}/.test(message)) {
    return { errorType: 'api_error', errorCode: 'API_ERROR' };
  }
  return { errorType: 'unknown', errorCode: 'INTERNAL_ERROR' };
}

/**
 * Determines if an error is retryable based on its category.
 * Timeouts and cancellations are never retried; rate limits and API errors are.
 */
export function isRetryableError(error: Error, apiErrorPrefix: string): boolean {
  const { errorType } = categorizeError(error, apiErrorPrefix);
  if (errorType === 'timeout' || errorType === 'cancelled') {
    return false;
  }
  return errorType === 'rate_limit' || errorType === 'api_error';
}
