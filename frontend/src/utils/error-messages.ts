/**
 * Utility functions for generating user-friendly error messages
 */

export type ErrorType = 'timeout' | 'rate_limit' | 'api_error' | 'cancelled' | 'unknown';

export interface ErrorContext {
  errorType?: ErrorType;
  errorCode?: string;
  partialContent?: string;
  originalMessage: string;
}

/**
 * Generates a user-friendly error message based on error type and context
 */
export function getUserFriendlyErrorMessage(context: ErrorContext): string {
  const { errorType, originalMessage, partialContent } = context;

  switch (errorType) {
    case 'timeout':
      return partialContent
        ? `⏱️ The request timed out, but some content was generated. Please try again with a simpler request.`
        : `⏱️ The request timed out. Please try again with a simpler request or check your connection.`;

    case 'rate_limit':
      return `🚦 Rate limit exceeded. Please wait a moment before trying again.`;

    case 'cancelled':
      return `🚫 Request was cancelled`;

    case 'api_error':
      // Check if it's a specific API error we know about
      if (originalMessage.includes('401') || originalMessage.includes('Unauthorized')) {
        return `🔐 Authentication error. Please check your API credentials.`;
      }
      if (originalMessage.includes('403') || originalMessage.includes('Forbidden')) {
        return `🔐 Access denied. Please check your API permissions.`;
      }
      if (originalMessage.includes('404')) {
        return `❓ Resource not found. The requested endpoint may not be available.`;
      }
      if (originalMessage.includes('500') || originalMessage.includes('502') || originalMessage.includes('503')) {
        return `🔧 Server error. Please try again in a few moments.`;
      }
      return `⚠️ API error: ${originalMessage}. Please try again.`;

    case 'unknown':
    default:
      return originalMessage;
  }
}

/**
 * Extracts error type from error message (for legacy error handling)
 */
export function detectErrorType(errorMessage: string): ErrorType {
  const msg = errorMessage.toLowerCase();

  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'timeout';
  }
  if (msg.includes('rate limit') || msg.includes('429') || msg.includes('quota')) {
    return 'rate_limit';
  }
  if (msg.includes('cancel') || msg.includes('abort')) {
    return 'cancelled';
  }
  if (msg.includes('api error') || /[45]\d{2}/.test(msg)) {
    return 'api_error';
  }
  return 'unknown';
}

/**
 * Determines if an error is retryable based on its type
 */
export function isRetryableError(errorType?: ErrorType): boolean {
  // Don't retry timeouts or cancellations
  if (errorType === 'timeout' || errorType === 'cancelled') {
    return false;
  }
  // Retry rate limits and API errors
  return errorType === 'rate_limit' || errorType === 'api_error' || errorType === 'unknown';
}

/**
 * Gets a suggested action for the user based on error type
 */
export function getSuggestedAction(errorType?: ErrorType): string | null {
  switch (errorType) {
    case 'timeout':
      return 'Try breaking down your request into smaller steps or simplifying the requirements.';
    case 'rate_limit':
      return 'Wait a few moments before making another request.';
    case 'api_error':
      return 'Check your connection and try again. If the problem persists, contact support.';
    case 'cancelled':
      return null; // No action needed for user cancellation
    default:
      return 'Please try again. If the problem persists, contact support.';
  }
}
