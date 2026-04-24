/**
 * Utility functions for generating user-friendly error messages
 */

import type { QualityReport } from '@ai-app-builder/shared/types';

export type ErrorType =
  | 'timeout'
  | 'rate_limit'
  | 'api_error'
  | 'provider_unavailable'
  | 'cancelled'
  | 'validation'
  | 'ai_output'
  | 'state'
  | 'network'
  | 'unknown';

export interface ErrorContext {
  errorType?: ErrorType;
  errorCode?: string;
  partialContent?: string;
  originalMessage: string;
  qualityReport?: QualityReport;
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
  const { errorType, originalMessage, partialContent, qualityReport } = context;

  switch (errorType) {
    case 'timeout': {
      const timeMatch = originalMessage.match(/(\d+)\s*seconds?/i);
      const elapsed = timeMatch ? ` after ${timeMatch[1]}s` : '';
      return partialContent
        ? `The request timed out${elapsed}, but some content was generated. Try a shorter, more specific prompt.`
        : `The request timed out${elapsed}. Try a shorter, more specific prompt or check your connection.`;
    }

    case 'rate_limit': {
      const retrySeconds = extractRetryAfterSeconds(originalMessage);
      return retrySeconds
        ? `Rate limit reached. Retrying in ${retrySeconds} seconds...`
        : `Rate limit reached. The system will retry automatically.`;
    }

    case 'cancelled':
      return `Request was cancelled.`;

    case 'network':
      return `Could not reach the server. Check your internet connection and try again.`;

    case 'validation':
      if (qualityReport && Array.isArray(qualityReport.issues) && qualityReport.issues.length > 0) {
        return describeDeliveryFailure(qualityReport);
      }
      return `The request could not be processed. Please try a different approach.`;

    case 'ai_output':
      if (qualityReport && Array.isArray(qualityReport.issues) && qualityReport.issues.length > 0) {
        return describeDeliveryFailure(qualityReport);
      }
      return `The AI generated invalid output. Please try rephrasing your request.`;

    case 'state':
      return `The project state is inconsistent. Try again or reload the project.`;

    case 'provider_unavailable':
      return `AI service is temporarily unavailable. Please try again in a few minutes.`;

    case 'api_error':
      if (originalMessage.includes('401') || originalMessage.includes('Unauthorized')) {
        return `Authentication error. Check your API key in Agent Settings.`;
      }
      if (originalMessage.includes('403') || originalMessage.includes('Forbidden')) {
        return `Access denied. Check your API key permissions in Agent Settings.`;
      }
      if (originalMessage.includes('404')) {
        return `The requested endpoint is not available. Check that the backend is running.`;
      }
      if (originalMessage.includes('500') || originalMessage.includes('502') || originalMessage.includes('503')) {
        return `Server error. Please try again in a few moments.`;
      }
      return `An API error occurred. Please try again.`;

    case 'unknown':
    default:
      return `Something went wrong. Please try again.`;
  }
}

function describeDeliveryFailure(qualityReport: QualityReport): string {
  const topIssues = qualityReport.issues
    .slice(0, 2)
    .map((issue) => issue.file ? `${issue.file}: ${issue.message}` : issue.message)
    .join(' ');

  switch (qualityReport.deliveryStage) {
    case 'acceptance':
      return `The generated app failed structural validation. ${topIssues}`.trim();
    case 'runtime_smoke':
      return `The generated app failed runtime smoke checks. ${topIssues}`.trim();
    case 'repair':
      return `Automatic repair could not deliver a runnable app. ${topIssues}`.trim();
    default:
      return `The generated app did not pass delivery checks. ${topIssues}`.trim();
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
  if (msg.includes('provider_unavailable') || msg.includes('provider unavailable') || msg.includes('service unavailable')) {
    return 'provider_unavailable';
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch') ||
      msg.includes('net::') || msg.includes('econnrefused') || msg.includes('enotfound')) {
    return 'network';
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
