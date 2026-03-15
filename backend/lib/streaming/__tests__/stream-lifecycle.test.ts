/**
 * Tests for stream-lifecycle module
 * Following industry best practices: AAA pattern, clear descriptions, edge cases, proper mocking
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createStreamLifecycle, type StreamLifecycleConfig } from '../stream-lifecycle';

// Mock the logger
vi.mock('../../logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock the backpressure-controller
vi.mock('../backpressure-controller', () => ({
  BackpressureController: vi.fn().mockImplementation(function() {
    return { logStats: vi.fn() };
  }),
  EventPriority: {
    NORMAL: 'normal',
    CRITICAL: 'critical',
  },
}));

// Mock the sse-encoder
vi.mock('../sse-encoder', () => ({
  SSEEncoder: vi.fn().mockImplementation(function() {
    return { enqueueHeartbeat: vi.fn(), enqueueEvent: vi.fn() };
  }),
}));

import { SSEEncoder } from '../sse-encoder';
import { BackpressureController, EventPriority } from '../backpressure-controller';

describe('createStreamLifecycle', () => {
  let mockController: any;
  let mockEncoder: any;
  let mockBackpressure: any;
  let mockLogger: any;
  let mockSignal: AbortSignal | undefined;
  let config: StreamLifecycleConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockController = {
      enqueue: vi.fn(),
      close: vi.fn(),
    };

    mockEncoder = {
      enqueueHeartbeat: vi.fn(),
      enqueueEvent: vi.fn(),
    };

    mockBackpressure = {
      logStats: vi.fn(),
    };

    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    mockSignal = undefined;
    config = {
      heartbeatIntervalMs: 1000,
      streamTimeoutMs: 5000,
    };

    vi.mocked(SSEEncoder).mockReturnValue(mockEncoder);
    vi.mocked(BackpressureController).mockReturnValue(mockBackpressure);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should create lifecycle with all required methods', () => {
      // Arrange
      // No arrangement needed

      // Act
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Assert
      expect(lifecycle).toHaveProperty('isComplete');
      expect(lifecycle).toHaveProperty('cleanup');
      expect(lifecycle).toHaveProperty('safeClose');
      expect(lifecycle).toHaveProperty('safeEnqueue');
      expect(typeof lifecycle.isComplete).toBe('function');
      expect(typeof lifecycle.cleanup).toBe('function');
      expect(typeof lifecycle.safeClose).toBe('function');
      expect(typeof lifecycle.safeEnqueue).toBe('function');
    });

    it('should start heartbeat interval', () => {
      // Arrange
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      vi.advanceTimersByTime(1000);

      // Assert
      expect(mockEncoder.enqueueHeartbeat).toHaveBeenCalledWith(mockController);
    });

    it('should set stream timeout', () => {
      // Arrange
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      vi.advanceTimersByTime(5000);

      // Assert
      expect(mockEncoder.enqueueEvent).toHaveBeenCalledWith(
        mockController,
        'error',
        { error: 'Stream timeout after 5 seconds' },
        EventPriority.CRITICAL
      );
      expect(mockController.close).toHaveBeenCalled();
    });

    it('should return false for isComplete initially', () => {
      // Arrange
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      const result = lifecycle.isComplete();

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('safeEnqueue', () => {
    it('should enqueue data when stream is not complete', () => {
      // Arrange
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );
      const data = new Uint8Array([1, 2, 3]);

      // Act
      lifecycle.safeEnqueue(data);

      // Assert
      expect(mockController.enqueue).toHaveBeenCalledWith(data);
    });

    it('should not enqueue data when stream is complete', () => {
      // Arrange
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );
      lifecycle.cleanup();
      const data = new Uint8Array([1, 2, 3]);

      // Act
      lifecycle.safeEnqueue(data);

      // Assert
      expect(mockController.enqueue).not.toHaveBeenCalled();
    });

    it('should handle controller enqueue errors gracefully', () => {
      // Arrange
      mockController.enqueue.mockImplementation(() => {
        throw new Error('Controller closed');
      });
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );
      const data = new Uint8Array([1, 2, 3]);

      // Act & Assert
      expect(() => lifecycle.safeEnqueue(data)).not.toThrow();
    });

    it('should enqueue multiple data chunks', () => {
      // Arrange
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );
      const data1 = new Uint8Array([1, 2, 3]);
      const data2 = new Uint8Array([4, 5, 6]);
      const data3 = new Uint8Array([7, 8, 9]);

      // Act
      lifecycle.safeEnqueue(data1);
      lifecycle.safeEnqueue(data2);
      lifecycle.safeEnqueue(data3);

      // Assert
      expect(mockController.enqueue).toHaveBeenCalledTimes(3);
      expect(mockController.enqueue).toHaveBeenNthCalledWith(1, data1);
      expect(mockController.enqueue).toHaveBeenNthCalledWith(2, data2);
      expect(mockController.enqueue).toHaveBeenNthCalledWith(3, data3);
    });
  });

  describe('safeClose', () => {
    it('should close controller and cleanup', () => {
      // Arrange
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      lifecycle.safeClose();

      // Assert
      expect(mockController.close).toHaveBeenCalled();
      expect(mockBackpressure.logStats).toHaveBeenCalled();
    });

    it('should mark stream as complete', () => {
      // Arrange
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      lifecycle.safeClose();

      // Assert
      expect(lifecycle.isComplete()).toBe(true);
    });

    it('should be idempotent', () => {
      // Arrange
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      lifecycle.safeClose();
      lifecycle.safeClose();
      lifecycle.safeClose();

      // Assert
      expect(mockController.close).toHaveBeenCalledTimes(1);
      expect(mockBackpressure.logStats).toHaveBeenCalledTimes(1);
    });

    it('should handle controller close errors gracefully', () => {
      // Arrange
      mockController.close.mockImplementation(() => {
        throw new Error('Already closed');
      });
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act & Assert
      expect(() => lifecycle.safeClose()).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should clear heartbeat interval', () => {
      // Arrange
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      lifecycle.cleanup();
      vi.advanceTimersByTime(2000);

      // Assert
      expect(mockEncoder.enqueueHeartbeat).toHaveBeenCalledTimes(0);
    });

    it('should clear stream timeout', () => {
      // Arrange
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      lifecycle.cleanup();
      vi.advanceTimersByTime(10000);

      // Assert
      expect(mockEncoder.enqueueEvent).not.toHaveBeenCalled();
    });

    it('should log backpressure stats', () => {
      // Arrange
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      lifecycle.cleanup();

      // Assert
      expect(mockBackpressure.logStats).toHaveBeenCalled();
    });

    it('should mark stream as complete', () => {
      // Arrange
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      lifecycle.cleanup();

      // Assert
      expect(lifecycle.isComplete()).toBe(true);
    });
  });

  describe('abort signal handling', () => {
    it('should handle abort signal', () => {
      // Arrange
      const abortController = new AbortController();
      mockSignal = abortController.signal;
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      abortController.abort();

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith('Client disconnected, aborting SSE stream');
      expect(mockController.close).toHaveBeenCalled();
      expect(lifecycle.isComplete()).toBe(true);
    });

    it('should handle already aborted signal', () => {
      // Arrange
      const abortController = new AbortController();
      abortController.abort();
      mockSignal = abortController.signal;

      // Act
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith('Client disconnected, aborting SSE stream');
      expect(mockController.close).toHaveBeenCalled();
      expect(lifecycle.isComplete()).toBe(true);
    });

    it('should not abort if signal is undefined', () => {
      // Arrange
      mockSignal = undefined;
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      // No abort action

      // Assert
      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(lifecycle.isComplete()).toBe(false);
    });

    it('should only call abort listener once', () => {
      // Arrange
      const abortController = new AbortController();
      mockSignal = abortController.signal;
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      abortController.abort();
      abortController.abort();
      abortController.abort();

      // Assert
      expect(mockController.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('heartbeat', () => {
    it('should send heartbeat at configured interval', () => {
      // Arrange
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      vi.advanceTimersByTime(1000);
      vi.advanceTimersByTime(1000);
      vi.advanceTimersByTime(1000);

      // Assert
      expect(mockEncoder.enqueueHeartbeat).toHaveBeenCalledTimes(3);
    });

    it('should stop heartbeat after cleanup', () => {
      // Arrange
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      vi.advanceTimersByTime(1000);
      lifecycle.cleanup();
      vi.advanceTimersByTime(2000);

      // Assert
      expect(mockEncoder.enqueueHeartbeat).toHaveBeenCalledTimes(1);
    });

    it('should stop heartbeat after safeClose', () => {
      // Arrange
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      vi.advanceTimersByTime(1000);
      lifecycle.safeClose();
      vi.advanceTimersByTime(2000);

      // Assert
      expect(mockEncoder.enqueueHeartbeat).toHaveBeenCalledTimes(1);
    });

    it('should not send heartbeat when stream is complete', () => {
      // Arrange
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );
      lifecycle.cleanup();

      // Act
      vi.advanceTimersByTime(2000);

      // Assert
      expect(mockEncoder.enqueueHeartbeat).not.toHaveBeenCalled();
    });
  });

  describe('stream timeout', () => {
    it('should timeout after configured duration', () => {
      // Arrange
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      vi.advanceTimersByTime(5000);

      // Assert
      expect(mockEncoder.enqueueEvent).toHaveBeenCalledWith(
        mockController,
        'error',
        { error: 'Stream timeout after 5 seconds' },
        EventPriority.CRITICAL
      );
      expect(mockController.close).toHaveBeenCalled();
    });

    it('should not timeout if stream is closed before timeout', () => {
      // Arrange
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      vi.advanceTimersByTime(2000);
      lifecycle.safeClose();
      vi.advanceTimersByTime(5000);

      // Assert
      expect(mockEncoder.enqueueEvent).not.toHaveBeenCalledWith(
        mockController,
        'error',
        expect.any(Object),
        EventPriority.CRITICAL
      );
    });

    it('should format timeout message correctly', () => {
      // Arrange
      config.streamTimeoutMs = 30000;
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      vi.advanceTimersByTime(30000);

      // Assert
      expect(mockEncoder.enqueueEvent).toHaveBeenCalledWith(
        mockController,
        'error',
        { error: 'Stream timeout after 30 seconds' },
        EventPriority.CRITICAL
      );
    });
  });

  describe('edge cases', () => {
    it('should handle rapid cleanup calls', () => {
      // Arrange
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      lifecycle.cleanup();
      lifecycle.cleanup();
      lifecycle.cleanup();

      // Assert
      expect(mockBackpressure.logStats).toHaveBeenCalledTimes(1);
    });

    it('should handle rapid safeClose calls', () => {
      // Arrange
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      lifecycle.safeClose();
      lifecycle.safeClose();
      lifecycle.safeClose();

      // Assert
      expect(mockController.close).toHaveBeenCalledTimes(1);
    });

    it('should handle enqueue after abort', () => {
      // Arrange
      const abortController = new AbortController();
      mockSignal = abortController.signal;
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );
      abortController.abort();
      const data = new Uint8Array([1, 2, 3]);

      // Act
      lifecycle.safeEnqueue(data);

      // Assert
      expect(mockController.enqueue).not.toHaveBeenCalled();
    });

    it('should handle enqueue after timeout', () => {
      // Arrange
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );
      vi.advanceTimersByTime(5000);
      const data = new Uint8Array([1, 2, 3]);

      // Act
      lifecycle.safeEnqueue(data);

      // Assert
      expect(mockController.enqueue).not.toHaveBeenCalled();
    });

    it('should handle zero heartbeat interval', () => {
      // Arrange
      config.heartbeatIntervalMs = 0;
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      vi.advanceTimersByTime(100);

      // Assert
      // With zero interval, heartbeat should fire immediately
      expect(mockEncoder.enqueueHeartbeat).toHaveBeenCalled();
    });

    it('should handle very short timeout', () => {
      // Arrange
      config.streamTimeoutMs = 100;
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      vi.advanceTimersByTime(100);

      // Assert
      expect(mockEncoder.enqueueEvent).toHaveBeenCalledWith(
        mockController,
        'error',
        { error: 'Stream timeout after 0.1 seconds' },
        EventPriority.CRITICAL
      );
    });
  });

  describe('integration scenarios', () => {
    it('should handle normal stream lifecycle', () => {
      // Arrange
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      lifecycle.safeEnqueue(new Uint8Array([1]));
      vi.advanceTimersByTime(1000);
      lifecycle.safeEnqueue(new Uint8Array([2]));
      vi.advanceTimersByTime(1000);
      lifecycle.safeEnqueue(new Uint8Array([3]));
      lifecycle.safeClose();

      // Assert
      expect(mockController.enqueue).toHaveBeenCalledTimes(3);
      expect(mockEncoder.enqueueHeartbeat).toHaveBeenCalledTimes(2);
      expect(mockController.close).toHaveBeenCalled();
      expect(lifecycle.isComplete()).toBe(true);
    });

    it('should handle abort during active stream', () => {
      // Arrange
      const abortController = new AbortController();
      mockSignal = abortController.signal;
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      lifecycle.safeEnqueue(new Uint8Array([1]));
      vi.advanceTimersByTime(500);
      abortController.abort();
      lifecycle.safeEnqueue(new Uint8Array([2]));

      // Assert
      expect(mockController.enqueue).toHaveBeenCalledTimes(1);
      expect(mockController.close).toHaveBeenCalled();
      expect(lifecycle.isComplete()).toBe(true);
    });

    it('should handle timeout during active stream', () => {
      // Arrange
      config.streamTimeoutMs = 2000;
      const lifecycle = createStreamLifecycle(
        mockController,
        mockEncoder,
        mockBackpressure,
        mockSignal,
        mockLogger,
        config
      );

      // Act
      lifecycle.safeEnqueue(new Uint8Array([1]));
      vi.advanceTimersByTime(1000);
      lifecycle.safeEnqueue(new Uint8Array([2]));
      vi.advanceTimersByTime(1000);
      lifecycle.safeEnqueue(new Uint8Array([3]));

      // Assert
      expect(mockController.enqueue).toHaveBeenCalledTimes(2);
      expect(mockEncoder.enqueueEvent).toHaveBeenCalledWith(
        mockController,
        'error',
        expect.any(Object),
        EventPriority.CRITICAL
      );
      expect(lifecycle.isComplete()).toBe(true);
    });
  });
});
