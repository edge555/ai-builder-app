/**
 * Represents a runtime error captured from the preview.
 */
export interface RuntimeError {
  /** Error message */
  message: string;
  /** Stack trace if available */
  stack?: string;
  /** Component where the error occurred */
  componentStack?: string;
  /** File path if determinable from stack */
  filePath?: string;
  /** Line number if determinable */
  line?: number;
  /** Column number if determinable */
  column?: number;
  /** Error type classification */
  type: RuntimeErrorType;
  /** Priority level for repair ordering */
  priority: ErrorPriority;
  /** Timestamp when error occurred */
  timestamp: string;
  /** Source of the error detection */
  source: ErrorSource;
  /** Suggested fixes for this error type */
  suggestedFixes?: string[];
  /** Raw error object if available */
  rawError?: unknown;
}

/**
 * Classification of runtime error types.
 * Extended to cover more scenarios.
 */
export type RuntimeErrorType =
  | 'BUILD_ERROR'        // Bundler/compilation failure
  | 'IMPORT_ERROR'       // Module not found
  | 'UNDEFINED_EXPORT'   // Export not found in module
  | 'RENDER_ERROR'       // React component render failure
  | 'REFERENCE_ERROR'    // Undefined variable access
  | 'TYPE_ERROR'         // Type mismatch at runtime
  | 'SYNTAX_ERROR'       // JavaScript syntax error
  | 'NETWORK_ERROR'      // Failed API/fetch call
  | 'PROMISE_ERROR'      // Unhandled promise rejection
  | 'CSS_ERROR'          // CSS parsing failure
  | 'HYDRATION_ERROR'    // React hydration mismatch
  | 'UNKNOWN_ERROR';     // Catch-all

/**
 * Priority levels for error handling.
 * Higher priority errors are repaired first.
 */
export type ErrorPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Source of error detection.
 */
export type ErrorSource =
  | 'bundler'         // Sandpack bundler status
  | 'console'         // Console.error logs
  | 'error_boundary'  // React error boundary
  | 'network'         // Network request failures
  | 'manual';         // User-reported
