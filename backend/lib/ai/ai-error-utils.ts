/**
 * Shared AI error utilities.
 * Provides common error categorization logic used by all AI provider clients.
 */

import type { GeminiResponse } from './gemini-types';

type AIErrorType = GeminiResponse['errorType'];

/**
 * Categorizes an error into a type and code.
 * @param error The error to categorize
 * @param apiErrorPrefix Provider-specific prefix for API errors (e.g. 'gemini api error', 'modal api error')
 */
export function categorizeError(
  error: Error,
  apiErrorPrefix: string
): { errorType: AIErrorType; errorCode: string } {
  const message = error.message.toLowerCase();

  if (message.includes('timeout')) {
    return { errorType: 'timeout', errorCode: 'TIMEOUT' };
  }
  if (message.includes('cancel') || message.includes('abort')) {
    return { errorType: 'cancelled', errorCode: 'CANCELLED' };
  }
  if (message.includes('rate limit') || message.includes('429') || message.includes('quota')) {
    return { errorType: 'rate_limit', errorCode: 'RATE_LIMIT_EXCEEDED' };
  }
  if (message.includes(apiErrorPrefix) || /[45]\d{2}/.test(message)) {
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
