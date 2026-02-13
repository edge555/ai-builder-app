/**
 * Metrics and Timing Utilities
 * Tracks performance metrics for AI operations and API calls.
 */

/**
 * Timing metrics for AI operations
 */
export interface AIOperationMetrics {
  /** Unique request ID for correlation */
  requestId?: string;
  /** Operation name (e.g., 'generate', 'modify', 'plan') */
  operation: string;
  /** Start timestamp in milliseconds */
  startTime: number;
  /** End timestamp in milliseconds */
  endTime: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Number of input tokens (if available) */
  inputTokens?: number;
  /** Number of output tokens (if available) */
  outputTokens?: number;
  /** Total tokens used */
  totalTokens?: number;
  /** Whether the operation was successful */
  success: boolean;
  /** Error message if operation failed */
  error?: string;
  /** Number of retry attempts */
  retryCount?: number;
}

/**
 * Tracks timing for an operation
 */
export class OperationTimer {
  private startTime: number;
  private operation: string;
  private requestId?: string;

  constructor(operation: string, requestId?: string) {
    this.operation = operation;
    this.requestId = requestId;
    this.startTime = Date.now();
  }

  /**
   * Completes the timer and returns metrics
   */
  complete(success: boolean, additionalMetrics?: Partial<AIOperationMetrics>): AIOperationMetrics {
    const endTime = Date.now();
    return {
      requestId: this.requestId,
      operation: this.operation,
      startTime: this.startTime,
      endTime,
      durationMs: endTime - this.startTime,
      success,
      ...additionalMetrics,
    };
  }

  /**
   * Gets elapsed time in milliseconds without completing the timer
   */
  getElapsedMs(): number {
    return Date.now() - this.startTime;
  }
}

/**
 * Formats duration in milliseconds to a human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = (ms / 1000).toFixed(2);
  return `${seconds}s`;
}

/**
 * Formats metrics for logging
 */
export function formatMetrics(metrics: AIOperationMetrics): Record<string, unknown> {
  const formatted: Record<string, unknown> = {
    operation: metrics.operation,
    duration: formatDuration(metrics.durationMs),
    durationMs: metrics.durationMs,
    success: metrics.success,
  };

  if (metrics.requestId) {
    formatted.requestId = metrics.requestId;
  }

  if (metrics.inputTokens !== undefined) {
    formatted.inputTokens = metrics.inputTokens;
  }

  if (metrics.outputTokens !== undefined) {
    formatted.outputTokens = metrics.outputTokens;
  }

  if (metrics.totalTokens !== undefined) {
    formatted.totalTokens = metrics.totalTokens;
  }

  if (metrics.retryCount !== undefined && metrics.retryCount > 0) {
    formatted.retryCount = metrics.retryCount;
  }

  if (metrics.error) {
    formatted.error = metrics.error;
  }

  return formatted;
}
