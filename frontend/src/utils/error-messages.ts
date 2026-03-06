/**
 * Utility functions for generating user-friendly error messages
 */

export type ErrorType =
  | 'timeout'
  | 'rate_limit'
  | 'api_error'
  | 'cancelled'
  | 'validation'
  | 'ai_output'
  | 'network'
  | 'unknown';

export interface ErrorContext {
  errorType?: ErrorType;
  errorCode?: string;
  partialContent?: string;
  originalMessage: string;
}

/**
 * Extracts retry-after seconds from an error message.
 * Parses patterns like "retry after 30", "wait 30 seconds", "retry-after: 30".
 * Returns null if no specific time found (caller should use a default).
 */
export function extractRetryAfterSeconds(errorMessage: string): number | null {
  const msg = errorMessage.toLowerCase();
  const patterns = [
    /retry.?after[:\s]+(\d+)/,
    /wait\s+(\d+)\s*s/,
    /try again in\s+(\d+)/,
    /(\d+)\s*seconds?/,
  ];
  for (const pattern of patterns) {
    const match = msg.match(pattern);
    if (match) {
      const seconds = parseInt(match[1], 10);
      if (seconds > 0 && seconds < 3600) return seconds;
    }
  }
  return null;
}

/**
 * Generates a user-friendly error message based on error type and context
 */
export function getUserFriendlyErrorMessage(context: ErrorContext): string {
  const { errorType, originalMessage, partialContent } = context;

  switch (errorType) {
    case 'timeout':
      return partialContent
        ? `⏱️ The request timed out, but some content was generated. Try a shorter, more specific prompt.`
        : `⏱️ The request timed out. Try a shorter, more specific prompt or check your connection.`;

    case 'rate_limit':
      return `🚦 Rate limit exceeded. The system will retry automatically.`;

    case 'cancelled':
      return `🚫 Request was cancelled`;

    case 'api_error':
      if (originalMessage.includes('401') || originalMessage.includes('Unauthorized')) {
        return `🔐 Authentication error. Check your API key in Agent Settings.`;
      }
      if (originalMessage.includes('403') || originalMessage.includes('Forbidden')) {
        return `🔐 Access denied. Check your API key permissions in Agent Settings.`;
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
