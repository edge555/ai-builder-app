/**
 * Tests for API Utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withTimeout, TimeoutError } from './utils';

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should resolve when promise completes before timeout', async () => {
    const promise = Promise.resolve('success');

    const resultPromise = withTimeout(promise, {
      timeoutMs: 1000,
      operationName: 'test operation',
    });

    const result = await resultPromise;
    expect(result).toBe('success');
  });

  it('should reject with TimeoutError when promise exceeds timeout', async () => {
    const promise = new Promise((resolve) => {
      setTimeout(() => resolve('too late'), 2000);
    });

    const resultPromise = withTimeout(promise, {
      timeoutMs: 1000,
      operationName: 'test operation',
    });

    // Fast-forward time to trigger timeout
    vi.advanceTimersByTime(1000);

    await expect(resultPromise).rejects.toThrow(TimeoutError);
    await expect(resultPromise).rejects.toThrow('test operation timed out after 1000ms');
  });

  it('should include timeout duration in TimeoutError', async () => {
    const promise = new Promise((resolve) => {
      setTimeout(() => resolve('too late'), 10000); // Takes 10 seconds
    });

    const resultPromise = withTimeout(promise, {
      timeoutMs: 5000, // Timeout after 5 seconds
      operationName: 'long operation',
    });

    vi.advanceTimersByTime(5000);

    try {
      await resultPromise;
      expect.fail('Should have thrown TimeoutError');
    } catch (error) {
      expect(error).toBeInstanceOf(TimeoutError);
      if (error instanceof TimeoutError) {
        expect(error.timeoutMs).toBe(5000);
      }
    }
  });

  it('should call cleanup function on timeout', async () => {
    const cleanupFn = vi.fn();
    const promise = new Promise((resolve) => {
      setTimeout(() => resolve('too late'), 2000);
    });

    const resultPromise = withTimeout(promise, {
      timeoutMs: 1000,
      operationName: 'test operation',
      onTimeout: cleanupFn,
    });

    vi.advanceTimersByTime(1000);

    await expect(resultPromise).rejects.toThrow(TimeoutError);

    // Wait for cleanup to complete
    await vi.runAllTimersAsync();

    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });

  it('should call cleanup function when promise resolves', async () => {
    const cleanupFn = vi.fn();
    const promise = Promise.resolve('success');

    await withTimeout(promise, {
      timeoutMs: 1000,
      operationName: 'test operation',
      onTimeout: cleanupFn,
    });

    // Cleanup should not be called on successful completion
    expect(cleanupFn).not.toHaveBeenCalled();
  });

  it('should abort when AbortSignal is triggered', async () => {
    const controller = new AbortController();
    const promise = new Promise((resolve) => {
      setTimeout(() => resolve('too late'), 2000);
    });

    const resultPromise = withTimeout(promise, {
      timeoutMs: 5000,
      operationName: 'test operation',
      signal: controller.signal,
    });

    // Abort the operation
    controller.abort();

    await expect(resultPromise).rejects.toThrow('test operation was aborted');
  });

  it('should reject immediately if AbortSignal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const promise = Promise.resolve('success');

    const resultPromise = withTimeout(promise, {
      timeoutMs: 1000,
      operationName: 'test operation',
      signal: controller.signal,
    });

    await expect(resultPromise).rejects.toThrow('test operation was aborted before starting');
  });

  it('should clear timeout when promise resolves', async () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const promise = Promise.resolve('success');

    await withTimeout(promise, {
      timeoutMs: 1000,
      operationName: 'test operation',
    });

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('should handle promise rejection before timeout', async () => {
    const promise = Promise.reject(new Error('operation failed'));

    const resultPromise = withTimeout(promise, {
      timeoutMs: 1000,
      operationName: 'test operation',
    });

    await expect(resultPromise).rejects.toThrow('operation failed');
  });

  it('should handle async cleanup function', async () => {
    vi.useRealTimers(); // Use real timers for async cleanup test

    const cleanupFn = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    const promise = new Promise((resolve) => {
      setTimeout(() => resolve('too late'), 2000);
    });

    const resultPromise = withTimeout(promise, {
      timeoutMs: 100,
      operationName: 'test operation',
      onTimeout: cleanupFn,
    });

    await expect(resultPromise).rejects.toThrow(TimeoutError);

    // Wait a bit for async cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(cleanupFn).toHaveBeenCalledTimes(1);

    vi.useFakeTimers(); // Restore fake timers
  });

  it('should not call cleanup twice if both timeout and abort happen', async () => {
    const cleanupFn = vi.fn();
    const controller = new AbortController();

    const promise = new Promise((resolve) => {
      setTimeout(() => resolve('too late'), 5000);
    });

    const resultPromise = withTimeout(promise, {
      timeoutMs: 1000,
      operationName: 'test operation',
      onTimeout: cleanupFn,
      signal: controller.signal,
    });

    vi.advanceTimersByTime(1000);
    controller.abort();

    await expect(resultPromise).rejects.toThrow();

    // Wait for any pending cleanups
    await vi.runAllTimersAsync();

    // Cleanup should only be called once
    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });

  it('should handle errors in cleanup function gracefully', async () => {
    const cleanupFn = vi.fn(() => {
      throw new Error('cleanup failed');
    });

    const promise = new Promise((resolve) => {
      setTimeout(() => resolve('too late'), 2000);
    });

    const resultPromise = withTimeout(promise, {
      timeoutMs: 1000,
      operationName: 'test operation',
      onTimeout: cleanupFn,
    });

    vi.advanceTimersByTime(1000);

    // Should still throw TimeoutError, not cleanup error
    await expect(resultPromise).rejects.toThrow(TimeoutError);

    expect(cleanupFn).toHaveBeenCalled();
  });

  it('should use default operation name if not provided', async () => {
    const promise = new Promise((resolve) => {
      setTimeout(() => resolve('too late'), 2000);
    });

    const resultPromise = withTimeout(promise, {
      timeoutMs: 1000,
    });

    vi.advanceTimersByTime(1000);

    await expect(resultPromise).rejects.toThrow('operation timed out after 1000ms');
  });
});
