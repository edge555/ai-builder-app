/**
 * Tests for ai-retry module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { executeWithRetry, type RetryConfig, type RetryOperationResult } from '../ai-retry';
import type { Logger } from '../../logger';
import type { AIRequest, AIResponse } from '../ai-provider';

// Mock the metrics
vi.mock('../../metrics', () => ({
  OperationTimer: vi.fn().mockImplementation(function() {
    return { complete: vi.fn(() => ({ durationMs: 100, retryCount: 0 })) };
  }),
  formatMetrics: vi.fn(() => ({ durationMs: 100 })),
  recordOperation: vi.fn(),
}));

// Mock the ai-error-utils
vi.mock('../ai-error-utils', () => ({
  isRetryableError: vi.fn((error: Error, prefix: string) => {
    // Consider timeout and rate limit errors as retryable
    const message = error.message.toLowerCase();
    return message.includes('timeout') || message.includes('rate limit') || message.includes('429');
  }),
  categorizeError: vi.fn((error: Error, prefix: string) => ({
    errorType: 'api_error',
    errorCode: 'API_ERROR',
  })),
}));

describe('ai-retry', () => {
  let mockLogger: Logger;
  let mockRequest: AIRequest;
  let defaultConfig: RetryConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      withRequestId: vi.fn(() => mockLogger),
    } as unknown as Logger;

    mockRequest = {
      prompt: 'Test prompt',
      requestId: 'test-request-123',
    };

    defaultConfig = {
      maxRetries: 3,
      retryBaseDelay: 10, // Small delay for tests
      apiErrorPrefix: 'test',
    };
  });

  describe('executeWithRetry', () => {
    it('should return success on first successful operation', async () => {
      const operation = vi.fn().mockResolvedValue({
        content: 'Generated content',
      } as RetryOperationResult);

      const result = await executeWithRetry(
        'test-operation',
        mockRequest,
        defaultConfig,
        mockLogger,
        operation
      );

      expect(result.success).toBe(true);
      expect(result.content).toBe('Generated content');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should include modelId in response when provided', async () => {
      const configWithModel = { ...defaultConfig, modelId: 'gpt-4' };
      const operation = vi.fn().mockResolvedValue({
        content: 'Generated content',
      } as RetryOperationResult);

      const result = await executeWithRetry(
        'test-operation',
        mockRequest,
        configWithModel,
        mockLogger,
        operation
      );

      expect(result.modelId).toBe('gpt-4');
    });

    it('should retry on retryable errors', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Timeout error'))
        .mockResolvedValue({ content: 'Success after retry' } as RetryOperationResult);

      const result = await executeWithRetry(
        'test-operation',
        mockRequest,
        defaultConfig,
        mockLogger,
        operation
      );

      expect(result.success).toBe(true);
      expect(result.content).toBe('Success after retry');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable errors', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Invalid API key'));

      const result = await executeWithRetry(
        'test-operation',
        mockRequest,
        defaultConfig,
        mockLogger,
        operation
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid API key');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should exhaust all retries on persistent retryable errors', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Timeout error'));

      const result = await executeWithRetry(
        'test-operation',
        mockRequest,
        { ...defaultConfig, maxRetries: 2 },
        mockLogger,
        operation
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Timeout error');
      // Initial attempt + 2 retries = 3 calls
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should return retry count in response', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Timeout error'))
        .mockResolvedValue({ content: 'Success' } as RetryOperationResult);

      const result = await executeWithRetry(
        'test-operation',
        mockRequest,
        defaultConfig,
        mockLogger,
        operation
      );

      expect(result.retryCount).toBe(1);
    });

    it('should use context logger with request ID', async () => {
      const operation = vi.fn().mockResolvedValue({ content: 'Success' } as RetryOperationResult);

      await executeWithRetry(
        'test-operation',
        mockRequest,
        defaultConfig,
        mockLogger,
        operation
      );

      expect(mockLogger.withRequestId).toHaveBeenCalledWith('test-request-123');
    });

    it('should work without request ID', async () => {
      const requestWithoutId = { prompt: 'Test' };
      const operation = vi.fn().mockResolvedValue({ content: 'Success' } as RetryOperationResult);

      const result = await executeWithRetry(
        'test-operation',
        requestWithoutId,
        defaultConfig,
        mockLogger,
        operation
      );

      expect(result.success).toBe(true);
      expect(mockLogger.withRequestId).not.toHaveBeenCalled();
    });

    it('should include extra response fields', async () => {
      const operation = vi.fn().mockResolvedValue({
        content: 'Success',
        extraResponse: { tokensUsed: 100 },
      } as RetryOperationResult);

      const result = await executeWithRetry(
        'test-operation',
        mockRequest,
        defaultConfig,
        mockLogger,
        operation
      );

      expect(result.tokensUsed).toBe(100);
    });

    it('should include extra log fields', async () => {
      const operation = vi.fn().mockResolvedValue({
        content: 'Success',
        extraLog: { customField: 'value' },
      } as RetryOperationResult);

      await executeWithRetry(
        'test-operation',
        mockRequest,
        defaultConfig,
        mockLogger,
        operation
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'test-operation completed',
        expect.objectContaining({ customField: 'value' })
      );
    });

    it('should handle rate limit errors as retryable', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Rate limit exceeded (429)'))
        .mockResolvedValue({ content: 'Success after rate limit' } as RetryOperationResult);

      const result = await executeWithRetry(
        'test-operation',
        mockRequest,
        defaultConfig,
        mockLogger,
        operation
      );

      expect(result.success).toBe(true);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should log warnings on retry attempts', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Timeout error'))
        .mockResolvedValue({ content: 'Success' } as RetryOperationResult);

      await executeWithRetry(
        'test-operation',
        mockRequest,
        defaultConfig,
        mockLogger,
        operation
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'test-operation attempt 0 failed, retrying...',
        expect.objectContaining({ error: 'Timeout error' })
      );
    });

    it('should log error on final failure', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Persistent error'));

      await executeWithRetry(
        'test-operation',
        mockRequest,
        { ...defaultConfig, maxRetries: 1 },
        mockLogger,
        operation
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'test-operation failed',
        expect.objectContaining({ durationMs: 100 })
      );
    });

    it('should handle non-Error thrown values', async () => {
      const operation = vi.fn().mockRejectedValue('string error');

      const result = await executeWithRetry(
        'test-operation',
        mockRequest,
        defaultConfig,
        mockLogger,
        operation
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('string error');
    });

    it('should handle null/undefined errors gracefully', async () => {
      const operation = vi.fn().mockRejectedValue(null);

      const result = await executeWithRetry(
        'test-operation',
        mockRequest,
        defaultConfig,
        mockLogger,
        operation
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('null');
    });
  });
});
