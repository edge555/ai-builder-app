import React, { Component, ErrorInfo, ReactNode } from 'react';
import './ErrorBoundary.css';

/**
 * Props for the ErrorBoundary component.
 */
export interface ErrorBoundaryProps {
  /** Child components to wrap */
  children: ReactNode;
  /** Optional fallback UI to render on error */
  fallback?: ReactNode;
  /** Callback when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Whether to show retry button */
  showRetry?: boolean;
  /** Custom error message */
  errorMessage?: string;
}

/**
 * State for the ErrorBoundary component.
 */
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error boundary component that catches JavaScript errors in child components.
 * Displays a user-friendly error message with retry functionality.
 * 
 * Requirements: 8.5, 11.1, 11.2, 11.3
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback, showRetry = true, errorMessage } = this.props;

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary-content">
            <span className="error-boundary-icon">⚠️</span>
            <h2 className="error-boundary-title">Something went wrong</h2>
            <p className="error-boundary-message">
              {errorMessage || error?.message || 'An unexpected error occurred.'}
            </p>
            {showRetry && (
              <button
                className="error-boundary-retry-btn"
                onClick={this.handleRetry}
                aria-label="Try again"
              >
                Try Again
              </button>
            )}
          </div>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
