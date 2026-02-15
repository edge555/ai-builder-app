import type { RuntimeError, ErrorSource } from '@ai-app-builder/shared/types';
import { createRuntimeError } from '@ai-app-builder/shared/utils';
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { createLogger } from '@/utils/logger';
import './PreviewErrorBoundary.css';

const previewBoundaryLogger = createLogger('PreviewErrorBoundary');

/**
 * Props for the PreviewErrorBoundary component.
 */
export interface PreviewErrorBoundaryProps {
  children: ReactNode;
  /** Callback when a runtime error is captured */
  onError?: (error: RuntimeError) => void;
  /** Callback to trigger auto-repair */
  onAutoRepair?: (error: RuntimeError) => void;
  /** Whether auto-repair is available */
  canAutoRepair?: boolean;
  /** Whether auto-repair is currently in progress */
  isAutoRepairing?: boolean;
}

interface PreviewErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  runtimeError: RuntimeError | null;
}

/**
 * Enhanced error boundary for the preview panel.
 * Captures React render errors and provides auto-repair functionality.
 */
export class PreviewErrorBoundary extends Component<
  PreviewErrorBoundaryProps,
  PreviewErrorBoundaryState
> {
  constructor(props: PreviewErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      runtimeError: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<PreviewErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const runtimeError = createRuntimeError(error, 'error_boundary' as ErrorSource, errorInfo.componentStack ?? undefined);

    this.setState({
      errorInfo,
      runtimeError,
    });

    // Notify parent of the error
    this.props.onError?.(runtimeError);

    previewBoundaryLogger.error('Caught error', {
      message: error.message,
      type: runtimeError.type,
      filePath: runtimeError.filePath,
      line: runtimeError.line,
    });
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      runtimeError: null,
    });
  };

  handleAutoRepair = (): void => {
    const { runtimeError } = this.state;
    if (runtimeError && this.props.onAutoRepair) {
      this.props.onAutoRepair(runtimeError);
    }
  };

  render(): ReactNode {
    const { hasError, error, runtimeError } = this.state;
    const { children, canAutoRepair, isAutoRepairing } = this.props;

    if (hasError) {
      return (
        <div className="preview-error-boundary" role="alert">
          <div className="preview-error-content">
            <div className="preview-error-icon">⚠️</div>
            <h3 className="preview-error-title">Preview Error</h3>

            <div className="preview-error-details">
              <p className="preview-error-type">
                {runtimeError?.type.replace('_', ' ') || 'Runtime Error'}
              </p>
              <p className="preview-error-message">
                {error?.message || 'An error occurred while rendering the preview.'}
              </p>
              {runtimeError?.filePath && (
                <p className="preview-error-location">
                  📁 {runtimeError.filePath}
                  {runtimeError.line ? `:${runtimeError.line}` : ''}
                </p>
              )}
            </div>

            <div className="preview-error-actions">
              {canAutoRepair && !isAutoRepairing && (
                <button
                  className="preview-error-btn preview-error-btn-primary"
                  onClick={this.handleAutoRepair}
                >
                  🔧 Auto-Repair
                </button>
              )}
              {isAutoRepairing && (
                <button
                  className="preview-error-btn preview-error-btn-disabled"
                  disabled
                >
                  ⏳ Repairing...
                </button>
              )}
              <button
                className="preview-error-btn preview-error-btn-secondary"
                onClick={this.handleRetry}
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default PreviewErrorBoundary;