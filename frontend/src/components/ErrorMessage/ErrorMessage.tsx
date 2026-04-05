import { forwardRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  /** Optional action button rendered alongside retry */
  actionButton?: { label: string; onClick: () => void };
}

/**
 * Maps error types to user-friendly titles.
 */
const ERROR_TITLES: Record<ErrorType, string> = {
  network: 'Connection Error',
  validation: 'Validation Error',
  ai_output: 'Generation Error',
  state: 'State Error',
  timeout: 'Request Timeout',
  rate_limit: 'Rate Limit',
  api_error: 'API Error',
  provider_unavailable: 'Provider Unavailable',
  cancelled: 'Cancelled',
  unknown: 'Error',
};

/**
 * Maps error types to helpful suggestions.
 */
const ERROR_SUGGESTIONS: Record<ErrorType, string> = {
  network: 'Check your internet connection and try again.',
  validation: 'The request could not be processed. Please try a different approach.',
  ai_output: 'The AI generated invalid output. Please try rephrasing your request.',
  state: 'The project state may be out of sync. Try again or reload the project.',
  timeout: 'Try a shorter, more specific prompt or check your connection.',
  rate_limit: 'The system will retry automatically when the rate limit clears.',
  api_error: 'The server returned an error. Please try again later.',
  provider_unavailable: 'The AI provider is temporarily unavailable. Please try again in a moment.',
  cancelled: 'The request was cancelled.',
  unknown: 'An unexpected error occurred. Please try again.',
};

/**
 * Returns true if this error type should show a "Go to Settings" action button.
 */
function isAuthError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('401') || lower.includes('403') ||
    lower.includes('unauthorized') || lower.includes('forbidden') ||
    lower.includes('api key') || lower.includes('credentials');
}

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
    actionButton,
  },
  ref
) {
  const navigate = useNavigate();
  const errorType = type || classifyError(message);
  const title = ERROR_TITLES[errorType];
  const suggestion = ERROR_SUGGESTIONS[errorType];

  const resolvedActionButton = useMemo(() => {
    if (actionButton) return actionButton;
    if (errorType === 'api_error' && isAuthError(message)) {
      return { label: 'Go to Settings', onClick: () => navigate('/settings/agents') };
    }
    return null;
  }, [actionButton, errorType, message, navigate]);

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
      <div className="error-message-actions">
        {recoverable && onRetry && (
          <button className="error-message-retry-btn" onClick={onRetry} aria-label="Retry">
            Try Again
          </button>
        )}
        {resolvedActionButton && (
          <button className="error-message-action-btn" onClick={resolvedActionButton.onClick}>
            {resolvedActionButton.label}
          </button>
        )}
      </div>
    </div>
  );
});

ErrorMessage.displayName = 'ErrorMessage';

export default ErrorMessage;
