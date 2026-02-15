import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import './ComponentErrorBoundary.css';

/**
 * Props for the ComponentErrorBoundary component.
 */
export interface ComponentErrorBoundaryProps {
  children: ReactNode;
  /** Name of the component for display in error message */
  componentName?: string;
  /** Callback when an error is captured */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ComponentErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Generic error boundary for lazy-loaded components.
 * Catches component load failures and render errors with retry functionality.
 */
export class ComponentErrorBoundary extends Component<
  ComponentErrorBoundaryProps,
  ComponentErrorBoundaryState
> {
  constructor(props: ComponentErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ComponentErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({
      errorInfo,
    });

    // Log error to console for debugging
    console.error(`ComponentErrorBoundary caught error in ${this.props.componentName || 'component'}:`, {
      error,
      errorInfo,
      componentStack: errorInfo.componentStack,
    });

    // Notify parent of the error
    this.props.onError?.(error, errorInfo);
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
    const { children, componentName } = this.props;

    if (hasError) {
      return (
        <div className="component-error-boundary" role="alert">
          <div className="component-error-content">
            <AlertTriangle className="component-error-icon" size={48} />
            <h3 className="component-error-title">
              {componentName ? `${componentName} Failed to Load` : 'Component Error'}
            </h3>

            <div className="component-error-details">
              <p className="component-error-message">
                {error?.message || 'An error occurred while loading this component.'}
              </p>
              {error?.name && (
                <p className="component-error-type">
                  Error type: {error.name}
                </p>
              )}
            </div>

            <button
              className="component-error-retry-btn"
              onClick={this.handleRetry}
              aria-label="Retry loading component"
            >
              <RefreshCw size={16} />
              Retry
            </button>

            <details className="component-error-stack">
              <summary>Technical Details</summary>
              <pre>{error?.stack}</pre>
            </details>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default ComponentErrorBoundary;
