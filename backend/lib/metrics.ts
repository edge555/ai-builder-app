/**
 * @module metrics
 * @description Lightweight performance metrics for AI operations and API calls.
 * Provides `OperationTimer` for timing any operation and `formatMetrics` for
 * structuring results for log output.
 *
 * @requires No runtime dependencies.
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
 * Per-operation aggregate stats tracked in memory.
 */
interface OperationStats {
  count: number;
  successCount: number;
  totalDurationMs: number;
  totalTokens: number;
  totalRetries: number;
  lastOperationAt?: number;
}

interface StageTimingStats {
  count: number;
  totalDurationMs: number;
  samplesMs: number[];
  lastRecordedAt?: number;
}

const MAX_STAGE_SAMPLES = 500;

/**
 * Summary of all operations since server start.
 */
export interface MetricsSummary {
  startedAt: string;
  uptimeMs: number;
  operations: Record<string, {
    count: number;
    successRate: number;
    avgDurationMs: number;
    totalTokens: number;
    totalRetries: number;
    lastOperationAt?: string;
  }>;
  generationStageTiming: Record<string, {
    count: number;
    avgDurationMs: number;
    p50Ms: number;
    p95Ms: number;
    lastRecordedAt?: string;
  }>;
}

const statsMap = new Map<string, OperationStats>();
const generationStageTimingMap = new Map<string, StageTimingStats>();
const serverStartedAt = Date.now();

/**
 * Records completed operation metrics into the in-memory registry.
 * Call this after each AI operation completes.
 */
export function recordOperation(metrics: AIOperationMetrics): void {
  const key = metrics.operation;
  const existing = statsMap.get(key) ?? {
    count: 0, successCount: 0, totalDurationMs: 0,
    totalTokens: 0, totalRetries: 0,
  };
  statsMap.set(key, {
    count: existing.count + 1,
    successCount: existing.successCount + (metrics.success ? 1 : 0),
    totalDurationMs: existing.totalDurationMs + metrics.durationMs,
    totalTokens: existing.totalTokens + (metrics.totalTokens ?? 0),
    totalRetries: existing.totalRetries + (metrics.retryCount ?? 0),
    lastOperationAt: metrics.endTime,
  });
}

/**
 * Returns aggregate metrics summary since server start.
 */
export function getMetricsSummary(): MetricsSummary {
  const operations: MetricsSummary['operations'] = {};
  const generationStageTiming: MetricsSummary['generationStageTiming'] = {};

  for (const [op, stats] of statsMap) {
    operations[op] = {
      count: stats.count,
      successRate: stats.count > 0 ? Math.round((stats.successCount / stats.count) * 100) / 100 : 0,
      avgDurationMs: stats.count > 0 ? Math.round(stats.totalDurationMs / stats.count) : 0,
      totalTokens: stats.totalTokens,
      totalRetries: stats.totalRetries,
      ...(stats.lastOperationAt && { lastOperationAt: new Date(stats.lastOperationAt).toISOString() }),
    };
  }

  for (const [stage, stats] of generationStageTimingMap) {
    const sorted = [...stats.samplesMs].sort((a, b) => a - b);
    generationStageTiming[stage] = {
      count: stats.count,
      avgDurationMs: stats.count > 0 ? Math.round(stats.totalDurationMs / stats.count) : 0,
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      ...(stats.lastRecordedAt && { lastRecordedAt: new Date(stats.lastRecordedAt).toISOString() }),
    };
  }

  return {
    startedAt: new Date(serverStartedAt).toISOString(),
    uptimeMs: Date.now() - serverStartedAt,
    operations,
    generationStageTiming,
  };
}

export function recordGenerationStageTiming(stage: string, durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;

  const existing = generationStageTimingMap.get(stage) ?? {
    count: 0,
    totalDurationMs: 0,
    samplesMs: [],
  };

  const samplesMs = [...existing.samplesMs, durationMs];
  if (samplesMs.length > MAX_STAGE_SAMPLES) {
    samplesMs.shift();
  }

  generationStageTimingMap.set(stage, {
    count: existing.count + 1,
    totalDurationMs: existing.totalDurationMs + durationMs,
    samplesMs,
    lastRecordedAt: Date.now(),
  });
}

function percentile(sortedValues: number[], ratio: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return Math.round(sortedValues[0]);

  const index = Math.ceil(sortedValues.length * ratio) - 1;
  const clamped = Math.min(Math.max(index, 0), sortedValues.length - 1);
  return Math.round(sortedValues[clamped]);
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
