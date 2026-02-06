/**
 * Hook for monitoring and processing errors from the Sandpack preview.
 * Captures console errors and bundler status to trigger auto-repair.
 */

import { useCallback, useRef, useEffect } from 'react';
import { 
  createRuntimeError, 
  shouldIgnoreError,
  parseBundlerError,
  type RuntimeError,
  type ErrorSource 
} from '@/shared/types/runtime-error';
import { errorAggregator, type AggregatedErrors } from '@/services/ErrorAggregator';

export interface UseErrorMonitorOptions {
  /** Callback when errors are ready for repair */
  onErrorsReady?: (errors: AggregatedErrors) => void;
  /** Whether monitoring is enabled */
  enabled?: boolean;
}

export interface UseErrorMonitorReturn {
  /** Report a console error */
  captureConsoleError: (message: string, stack?: string) => void;
  /** Report a bundler error */
  captureBundlerError: (message: string) => void;
  /** Report a runtime error from error boundary */
  captureRuntimeError: (error: Error, componentStack?: string) => void;
  /** Clear all pending errors */
  clearErrors: () => void;
  /** Get current error count */
  getErrorCount: () => number;
  /** Force flush pending errors */
  flush: () => AggregatedErrors;
  /** Check if there are pending errors */
  hasErrors: () => boolean;
}

/**
 * Hook for centralized error monitoring.
 */
export function useErrorMonitor(options: UseErrorMonitorOptions = {}): UseErrorMonitorReturn {
  const { onErrorsReady, enabled = true } = options;
  const isSetup = useRef(false);

  // Setup flush callback
  useEffect(() => {
    if (!enabled || isSetup.current) return;
    
    isSetup.current = true;
    
    if (onErrorsReady) {
      errorAggregator.setFlushCallback(onErrorsReady);
    }

    return () => {
      errorAggregator.clear();
      isSetup.current = false;
    };
  }, [enabled, onErrorsReady]);

  /**
   * Capture a console error message.
   */
  const captureConsoleError = useCallback((message: string, stack?: string) => {
    if (!enabled) return;
    
    // Ignore non-critical warnings
    if (shouldIgnoreError(message)) {
      return;
    }

    const error = createRuntimeError(
      new Error(message),
      'console' as ErrorSource
    );
    
    if (stack) {
      error.stack = stack;
    }

    errorAggregator.addError(error);
  }, [enabled]);

  /**
   * Capture a bundler error.
   */
  const captureBundlerError = useCallback((message: string) => {
    if (!enabled) return;

    const errorInfo = parseBundlerError(message);
    
    const error: RuntimeError = {
      message: errorInfo.message || message,
      type: errorInfo.type || 'BUILD_ERROR',
      priority: errorInfo.priority || 'critical',
      source: 'bundler',
      timestamp: new Date().toISOString(),
      filePath: errorInfo.filePath,
      line: errorInfo.line,
      column: errorInfo.column,
      suggestedFixes: errorInfo.suggestedFixes,
    };

    errorAggregator.addError(error);
  }, [enabled]);

  /**
   * Capture a runtime error from React error boundary.
   */
  const captureRuntimeError = useCallback((error: Error, componentStack?: string) => {
    if (!enabled) return;

    const runtimeError = createRuntimeError(error, 'error_boundary', componentStack);
    errorAggregator.addError(runtimeError);
  }, [enabled]);

  /**
   * Clear all pending errors.
   */
  const clearErrors = useCallback(() => {
    errorAggregator.clear();
  }, []);

  /**
   * Get current error count.
   */
  const getErrorCount = useCallback(() => {
    return errorAggregator.getCount();
  }, []);

  /**
   * Force flush pending errors.
   */
  const flush = useCallback(() => {
    return errorAggregator.flush();
  }, []);

  /**
   * Check if there are pending errors.
   */
  const hasErrors = useCallback(() => {
    return errorAggregator.hasErrors();
  }, []);

  return {
    captureConsoleError,
    captureBundlerError,
    captureRuntimeError,
    clearErrors,
    getErrorCount,
    flush,
    hasErrors,
  };
}
