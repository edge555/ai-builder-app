/**
 * Tests for ai-error-utils module
 * Following industry best practices: AAA pattern, clear descriptions, edge cases
 */

import { describe, it, expect } from 'vitest';
import { categorizeError, isRetryableError } from '../ai-error-utils';

describe('categorizeError', () => {
  describe('timeout errors', () => {
    it('should categorize timeout errors correctly', () => {
      // Arrange
      const error = new Error('Request timeout');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('timeout');
      expect(result.errorCode).toBe('TIMEOUT');
    });

    it('should categorize timeout errors with different casing', () => {
      // Arrange
      const error = new Error('TIMEOUT occurred');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('timeout');
      expect(result.errorCode).toBe('TIMEOUT');
    });

    it('should categorize timeout errors with timeout in middle of message', () => {
      // Arrange
      const error = new Error('The request timed out after 30 seconds');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('timeout');
      expect(result.errorCode).toBe('TIMEOUT');
    });
  });

  describe('cancelled errors', () => {
    it('should categorize cancelled errors correctly', () => {
      // Arrange
      const error = new Error('Request cancelled');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('cancelled');
      expect(result.errorCode).toBe('CANCELLED');
    });

    it('should categorize abort errors correctly', () => {
      // Arrange
      const error = new Error('Request aborted');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('cancelled');
      expect(result.errorCode).toBe('CANCELLED');
    });

    it('should categorize cancel with different casing', () => {
      // Arrange
      const error = new Error('CANCELLED by user');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('cancelled');
      expect(result.errorCode).toBe('CANCELLED');
    });
  });

  describe('rate limit errors', () => {
    it('should categorize rate limit errors correctly', () => {
      // Arrange
      const error = new Error('Rate limit exceeded');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('rate_limit');
      expect(result.errorCode).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should categorize 429 status code errors correctly', () => {
      // Arrange
      const error = new Error('HTTP 429 Too Many Requests');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('rate_limit');
      expect(result.errorCode).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should categorize quota errors correctly', () => {
      // Arrange
      const error = new Error('Quota exceeded');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('rate_limit');
      expect(result.errorCode).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should categorize rate limit with different casing', () => {
      // Arrange
      const error = new Error('RATE_LIMIT reached');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('rate_limit');
      expect(result.errorCode).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('API errors', () => {
    it('should categorize API errors with correct prefix', () => {
      // Arrange
      const error = new Error('openrouter api error: invalid request');
      const apiErrorPrefix = 'openrouter api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('api_error');
      expect(result.errorCode).toBe('API_ERROR');
    });

    it('should categorize 4xx status codes', () => {
      // Arrange
      const error = new Error('HTTP 400 Bad Request');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('api_error');
      expect(result.errorCode).toBe('API_ERROR');
    });

    it('should categorize 5xx status codes', () => {
      // Arrange
      const error = new Error('HTTP 500 Internal Server Error');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('api_error');
      expect(result.errorCode).toBe('API_ERROR');
    });

    it('should categorize 404 status codes', () => {
      // Arrange
      const error = new Error('HTTP 404 Not Found');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('api_error');
      expect(result.errorCode).toBe('API_ERROR');
    });

    it('should categorize 503 status codes', () => {
      // Arrange
      const error = new Error('HTTP 503 Service Unavailable');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('api_error');
      expect(result.errorCode).toBe('API_ERROR');
    });

    it('should not categorize 3xx status codes as API errors', () => {
      // Arrange
      const error = new Error('HTTP 301 Moved Permanently');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('unknown');
      expect(result.errorCode).toBe('INTERNAL_ERROR');
    });

    it('should not categorize 2xx status codes as API errors', () => {
      // Arrange
      const error = new Error('HTTP 200 OK');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('unknown');
      expect(result.errorCode).toBe('INTERNAL_ERROR');
    });
  });

  describe('unknown errors', () => {
    it('should categorize unknown errors correctly', () => {
      // Arrange
      const error = new Error('Some unknown error');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('unknown');
      expect(result.errorCode).toBe('INTERNAL_ERROR');
    });

    it('should categorize empty error messages as unknown', () => {
      // Arrange
      const error = new Error('');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('unknown');
      expect(result.errorCode).toBe('INTERNAL_ERROR');
    });

    it('should categorize errors without matching patterns as unknown', () => {
      // Arrange
      const error = new Error('Network error occurred');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('unknown');
      expect(result.errorCode).toBe('INTERNAL_ERROR');
    });
  });

  describe('edge cases', () => {
    it('should handle error with multiple matching patterns (timeout takes priority)', () => {
      // Arrange
      const error = new Error('timeout and rate limit');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('timeout');
      expect(result.errorCode).toBe('TIMEOUT');
    });

    it('should handle error with special characters', () => {
      // Arrange
      const error = new Error('Error: timeout @#$%');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('timeout');
      expect(result.errorCode).toBe('TIMEOUT');
    });

    it('should handle error with unicode characters', () => {
      // Arrange
      const error = new Error('Error: timeout 世界');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('timeout');
      expect(result.errorCode).toBe('TIMEOUT');
    });

    it('should handle error with very long message', () => {
      // Arrange
      const longMessage = 'a'.repeat(10000) + ' timeout';
      const error = new Error(longMessage);
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('timeout');
      expect(result.errorCode).toBe('TIMEOUT');
    });

    it('should handle error with newlines', () => {
      // Arrange
      const error = new Error('Error: timeout\nMore details here');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('timeout');
      expect(result.errorCode).toBe('TIMEOUT');
    });

    it('should handle error with tabs', () => {
      // Arrange
      const error = new Error('Error:\ttimeout');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('timeout');
      expect(result.errorCode).toBe('TIMEOUT');
    });
  });

  describe('provider-specific prefixes', () => {
    it('should handle modal api error prefix', () => {
      // Arrange
      const error = new Error('modal api error: invalid model');
      const apiErrorPrefix = 'modal api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('api_error');
      expect(result.errorCode).toBe('API_ERROR');
    });

    it('should handle openrouter api error prefix', () => {
      // Arrange
      const error = new Error('openrouter api error: authentication failed');
      const apiErrorPrefix = 'openrouter api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('api_error');
      expect(result.errorCode).toBe('API_ERROR');
    });

    it('should handle gemini api error prefix', () => {
      // Arrange
      const error = new Error('gemini api error: quota exceeded');
      const apiErrorPrefix = 'gemini api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('api_error');
      expect(result.errorCode).toBe('API_ERROR');
    });

    it('should not categorize error with different prefix as API error', () => {
      // Arrange
      const error = new Error('other api error: something went wrong');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = categorizeError(error, apiErrorPrefix);

      // Assert
      expect(result.errorType).toBe('unknown');
      expect(result.errorCode).toBe('INTERNAL_ERROR');
    });
  });
});

describe('isRetryableError', () => {
  describe('retryable errors', () => {
    it('should return true for rate limit errors', () => {
      // Arrange
      const error = new Error('Rate limit exceeded');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = isRetryableError(error, apiErrorPrefix);

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for 429 errors', () => {
      // Arrange
      const error = new Error('HTTP 429 Too Many Requests');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = isRetryableError(error, apiErrorPrefix);

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for API errors with correct prefix', () => {
      // Arrange
      const error = new Error('openrouter api error: server error');
      const apiErrorPrefix = 'openrouter api error';

      // Act
      const result = isRetryableError(error, apiErrorPrefix);

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for 5xx errors', () => {
      // Arrange
      const error = new Error('HTTP 500 Internal Server Error');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = isRetryableError(error, apiErrorPrefix);

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for 4xx errors', () => {
      // Arrange
      const error = new Error('HTTP 400 Bad Request');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = isRetryableError(error, apiErrorPrefix);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('non-retryable errors', () => {
    it('should return false for timeout errors', () => {
      // Arrange
      const error = new Error('Request timeout');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = isRetryableError(error, apiErrorPrefix);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for cancelled errors', () => {
      // Arrange
      const error = new Error('Request cancelled');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = isRetryableError(error, apiErrorPrefix);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for abort errors', () => {
      // Arrange
      const error = new Error('Request aborted');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = isRetryableError(error, apiErrorPrefix);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for unknown errors', () => {
      // Arrange
      const error = new Error('Some unknown error');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = isRetryableError(error, apiErrorPrefix);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for 3xx errors', () => {
      // Arrange
      const error = new Error('HTTP 301 Moved Permanently');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = isRetryableError(error, apiErrorPrefix);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for 2xx errors', () => {
      // Arrange
      const error = new Error('HTTP 200 OK');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = isRetryableError(error, apiErrorPrefix);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle error with empty message', () => {
      // Arrange
      const error = new Error('');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = isRetryableError(error, apiErrorPrefix);

      // Assert
      expect(result).toBe(false);
    });

    it('should handle error with multiple matching patterns', () => {
      // Arrange
      const error = new Error('timeout and rate limit');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = isRetryableError(error, apiErrorPrefix);

      // Assert
      expect(result).toBe(false); // timeout takes priority
    });

    it('should handle error with special characters', () => {
      // Arrange
      const error = new Error('Rate limit exceeded @#$%');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = isRetryableError(error, apiErrorPrefix);

      // Assert
      expect(result).toBe(true);
    });

    it('should handle error with unicode characters', () => {
      // Arrange
      const error = new Error('Rate limit exceeded 世界');
      const apiErrorPrefix = 'test api error';

      // Act
      const result = isRetryableError(error, apiErrorPrefix);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('provider-specific scenarios', () => {
    it('should handle modal provider errors correctly', () => {
      // Arrange
      const error = new Error('modal api error: server error');
      const apiErrorPrefix = 'modal api error';

      // Act
      const result = isRetryableError(error, apiErrorPrefix);

      // Assert
      expect(result).toBe(true);
    });

    it('should handle openrouter provider errors correctly', () => {
      // Arrange
      const error = new Error('openrouter api error: authentication failed');
      const apiErrorPrefix = 'openrouter api error';

      // Act
      const result = isRetryableError(error, apiErrorPrefix);

      // Assert
      expect(result).toBe(true);
    });

    it('should handle gemini provider timeout errors correctly', () => {
      // Arrange
      const error = new Error('Request timeout');
      const apiErrorPrefix = 'gemini api error';

      // Act
      const result = isRetryableError(error, apiErrorPrefix);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('integration with categorizeError', () => {
    it('should correctly determine retryability based on error type', () => {
      // Arrange
      const errors = [
        { message: 'timeout', expected: false },
        { message: 'cancelled', expected: false },
        { message: 'abort', expected: false },
        { message: 'rate limit', expected: true },
        { message: '429', expected: true },
        { message: 'quota', expected: true },
        { message: 'test api error: something', expected: true },
        { message: '500', expected: true },
        { message: '400', expected: true },
        { message: 'unknown', expected: false },
      ];

      // Act & Assert
      errors.forEach(({ message, expected }) => {
        const error = new Error(message);
        const result = isRetryableError(error, 'test api error');
        expect(result).toBe(expected);
      });
    });
  });
});
