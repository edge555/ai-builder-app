/**
 * Tests for Metrics and Timing utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OperationTimer, formatDuration, formatMetrics } from '../metrics';
import type { AIOperationMetrics } from '../metrics';

describe('OperationTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should track operation timing', () => {
    const timer = new OperationTimer('test-operation', 'req_123_abc');

    // Advance time by 500ms
    vi.advanceTimersByTime(500);

    const metrics = timer.complete(true);

    expect(metrics.operation).toBe('test-operation');
    expect(metrics.requestId).toBe('req_123_abc');
    expect(metrics.durationMs).toBe(500);
    expect(metrics.success).toBe(true);
  });

  it('should track elapsed time without completing', () => {
    const timer = new OperationTimer('test-operation');

    vi.advanceTimersByTime(250);
    expect(timer.getElapsedMs()).toBe(250);

    vi.advanceTimersByTime(250);
    expect(timer.getElapsedMs()).toBe(500);
  });

  it('should include additional metrics when completing', () => {
    const timer = new OperationTimer('generate', 'req_456_def');

    vi.advanceTimersByTime(1000);

    const metrics = timer.complete(true, {
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
      retryCount: 1,
    });

    expect(metrics.durationMs).toBe(1000);
    expect(metrics.inputTokens).toBe(100);
    expect(metrics.outputTokens).toBe(200);
    expect(metrics.totalTokens).toBe(300);
    expect(metrics.retryCount).toBe(1);
  });

  it('should handle failed operations', () => {
    const timer = new OperationTimer('test-operation');

    vi.advanceTimersByTime(100);

    const metrics = timer.complete(false, {
      error: 'Operation failed',
    });

    expect(metrics.success).toBe(false);
    expect(metrics.error).toBe('Operation failed');
    expect(metrics.durationMs).toBe(100);
  });

  it('should work without requestId', () => {
    const timer = new OperationTimer('test-operation');
    const metrics = timer.complete(true);

    expect(metrics.operation).toBe('test-operation');
    expect(metrics.requestId).toBeUndefined();
  });
});

describe('formatDuration', () => {
  it('should format durations under 1 second in milliseconds', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('should format durations over 1 second in seconds', () => {
    expect(formatDuration(1000)).toBe('1.00s');
    expect(formatDuration(1500)).toBe('1.50s');
    expect(formatDuration(5234)).toBe('5.23s');
    expect(formatDuration(60000)).toBe('60.00s');
  });
});

describe('formatMetrics', () => {
  it('should format basic metrics', () => {
    const metrics: AIOperationMetrics = {
      operation: 'generate',
      startTime: 1000,
      endTime: 2000,
      durationMs: 1000,
      success: true,
    };

    const formatted = formatMetrics(metrics);

    expect(formatted).toEqual({
      operation: 'generate',
      duration: '1.00s',
      durationMs: 1000,
      success: true,
    });
  });

  it('should include requestId when present', () => {
    const metrics: AIOperationMetrics = {
      requestId: 'req_123_abc',
      operation: 'generate',
      startTime: 1000,
      endTime: 1500,
      durationMs: 500,
      success: true,
    };

    const formatted = formatMetrics(metrics);

    expect(formatted.requestId).toBe('req_123_abc');
  });

  it('should include token usage when present', () => {
    const metrics: AIOperationMetrics = {
      operation: 'generate',
      startTime: 1000,
      endTime: 2000,
      durationMs: 1000,
      success: true,
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
    };

    const formatted = formatMetrics(metrics);

    expect(formatted.inputTokens).toBe(100);
    expect(formatted.outputTokens).toBe(200);
    expect(formatted.totalTokens).toBe(300);
  });

  it('should include retry count when greater than 0', () => {
    const metrics: AIOperationMetrics = {
      operation: 'generate',
      startTime: 1000,
      endTime: 2000,
      durationMs: 1000,
      success: true,
      retryCount: 2,
    };

    const formatted = formatMetrics(metrics);

    expect(formatted.retryCount).toBe(2);
  });

  it('should not include retry count when 0', () => {
    const metrics: AIOperationMetrics = {
      operation: 'generate',
      startTime: 1000,
      endTime: 2000,
      durationMs: 1000,
      success: true,
      retryCount: 0,
    };

    const formatted = formatMetrics(metrics);

    expect(formatted).not.toHaveProperty('retryCount');
  });

  it('should include error message when present', () => {
    const metrics: AIOperationMetrics = {
      operation: 'generate',
      startTime: 1000,
      endTime: 2000,
      durationMs: 1000,
      success: false,
      error: 'Operation timed out',
    };

    const formatted = formatMetrics(metrics);

    expect(formatted.error).toBe('Operation timed out');
    expect(formatted.success).toBe(false);
  });
});
