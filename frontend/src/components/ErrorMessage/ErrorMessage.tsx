import { forwardRef } from 'react';
import { type ErrorType } from '../../utils/error-messages';

import './ErrorMessage.css';

/**
 * Props for the ErrorMessage component.
 */
export interface ErrorMessageProps {
  /** The error message to display */
  message: string;
  /** Type of error for styling and messaging */
  type?: ErrorType;
  /** Whether the error is recoverable (shows retry button) */
  recoverable?: boolean;
  /** Callback when retry button is clicked */
  onRetry?: () => void;
  /** Callback when dismiss button is clicked */
  onDismiss?: () => void;
  /** Additional CSS class name */
  className?: string;
}

/**
 * Maps error types to user-friendly titles.
 */
const ERROR_TITLES: Record<ErrorType, string> = {
  network: 'Connection Error',
  validation: 'Validation Error',
  ai_output: 'Generation Error',
  timeout: 'Request Timeout',
  rate_limit: 'Rate Limit',
  api_error: 'API Error',
  cancelled: 'Cancelled',
  unknown: 'Error',
};

/**
 * Maps error types to helpful suggestions.
 */
const ERROR_SUGGESTIONS: Record<ErrorType, string> = {
  network: 'Please check your internet connection and try again.',
  validation: 'The request could not be processed. Please try a different approach.',
  ai_output: 'The AI generated invalid output. Please try rephrasing your request.',
  timeout: 'The request took too long. Please try again.',
  rate_limit: 'Please wait a moment before trying again.',
  api_error: 'The server returned an error. Please try again later.',
  cancelled: 'The request was cancelled.',
  unknown: 'An unexpected error occurred. Please try again.',
};

/**
 * Classifies an error message into an error type.
 */
export function classifyError(message: string): ErrorType {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('network') ||
    lowerMessage.includes('fetch') ||
    lowerMessage.includes('connection') ||
    lowerMessage.includes('api error')) {
    return 'network';
  }

  if (lowerMessage.includes('validation') ||
    lowerMessage.includes('invalid')) {
    return 'validation';
  }

  if (lowerMessage.includes('ai') ||
    lowerMessage.includes('generation') ||
    lowerMessage.includes('malformed')) {
    return 'ai_output';
  }

  if (lowerMessage.includes('timeout') ||
    lowerMessage.includes('timed out')) {
    return 'timeout';
  }

  return 'unknown';
}

/**
 * ErrorMessage component for displaying user-friendly error messages.
 * Supports retry functionality for recoverable errors.
 * 
 * Requirements: 8.5, 11.1, 11.2, 11.3
 */
export const ErrorMessage = forwardRef<HTMLDivElement, ErrorMessageProps>(function ErrorMessage(
  {
    message,
    type,
    recoverable = true,
    onRetry,
    onDismiss,
    className = '',
  },
  ref
) {
  const errorType = type || classifyError(message);
  const title = ERROR_TITLES[errorType];
  const suggestion = ERROR_SUGGESTIONS[errorType];

  return (
    <div
      ref={ref}
      className={`error-message error-message-${errorType} ${className}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="error-message-header">
        <span className="error-message-icon">⚠️</span>
        <span className="error-message-title">{title}</span>
        {onDismiss && (
          <button
            className="error-message-dismiss"
            onClick={onDismiss}
            aria-label="Dismiss error"
          >
            ×
          </button>
        )}
      </div>
      <p className="error-message-text">{message}</p>
      <p className="error-message-suggestion">{suggestion}</p>
      {recoverable && onRetry && (
        <button className="error-message-retry-btn" onClick={onRetry} aria-label="Retry">
          Try Again
        </button>
      )}
    </div>
  );
});

ErrorMessage.displayName = 'ErrorMessage';

export default ErrorMessage;
