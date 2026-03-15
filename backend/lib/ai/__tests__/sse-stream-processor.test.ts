/**
 * Tests for sse-stream-processor module
 * Following industry best practices: AAA pattern, clear descriptions, edge cases, proper mocking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processSSEStream } from '../sse-stream-processor';

// Mock the logger
vi.mock('../../logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock the shared utils
vi.mock('@ai-app-builder/shared/utils', () => ({
  stateError: vi.fn((service, message) => `${service}: ${message}`),
}));

describe('processSSEStream', () => {
  let mockReader: any;
  let mockResponse: Response;

  beforeEach(() => {
    mockReader = {
      read: vi.fn(),
    };
    mockResponse = {
      body: {
        getReader: vi.fn(() => mockReader),
      },
    } as any;
  });

  describe('happy path', () => {
    it('should process single chunk with single token', async () => {
      // Arrange
      const chunk = new TextEncoder().encode('data: Hello\n\n');
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk });
      mockReader.read.mockResolvedValueOnce({ done: true, value: undefined });
      const parseLine = vi.fn((line: string) => line.startsWith('data: ') ? line.slice(6) : null);
      const onToken = vi.fn();

      // Act
      const result = await processSSEStream(mockResponse, parseLine, onToken, 'TestService');

      // Assert
      expect(result).toBe('Hello');
      expect(onToken).toHaveBeenCalledWith('Hello', 5);
      expect(parseLine).toHaveBeenCalledWith('data: Hello');
    });

    it('should process multiple chunks', async () => {
      // Arrange
      const chunk1 = new TextEncoder().encode('data: Hello\n\n');
      const chunk2 = new TextEncoder().encode('data: World\n\n');
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk1 });
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk2 });
      mockReader.read.mockResolvedValueOnce({ done: true, value: undefined });
      const parseLine = vi.fn((line: string) => line.startsWith('data: ') ? line.slice(6) : null);
      const onToken = vi.fn();

      // Act
      const result = await processSSEStream(mockResponse, parseLine, onToken, 'TestService');

      // Assert
      expect(result).toBe('HelloWorld');
      expect(onToken).toHaveBeenCalledTimes(2);
      expect(onToken).toHaveBeenNthCalledWith(1, 'Hello', 5);
      expect(onToken).toHaveBeenNthCalledWith(2, 'World', 10);
    });

    it('should handle lines without tokens', async () => {
      // Arrange
      const chunk = new TextEncoder().encode('event: message\ndata: Hello\n\n');
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk });
      mockReader.read.mockResolvedValueOnce({ done: true, value: undefined });
      const parseLine = vi.fn((line: string) => line.startsWith('data: ') ? line.slice(6) : null);
      const onToken = vi.fn();

      // Act
      const result = await processSSEStream(mockResponse, parseLine, onToken, 'TestService');

      // Assert
      expect(result).toBe('Hello');
      expect(onToken).toHaveBeenCalledTimes(1);
      expect(parseLine).toHaveBeenCalledWith('event: message');
      expect(parseLine).toHaveBeenCalledWith('data: Hello');
    });

    it('should accumulate tokens correctly', async () => {
      // Arrange
      const chunk = new TextEncoder().encode('data: A\ndata: B\ndata: C\n\n');
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk });
      mockReader.read.mockResolvedValueOnce({ done: true, value: undefined });
      const parseLine = vi.fn((line: string) => line.startsWith('data: ') ? line.slice(6) : null);
      const onToken = vi.fn();

      // Act
      const result = await processSSEStream(mockResponse, parseLine, onToken, 'TestService');

      // Assert
      expect(result).toBe('ABC');
      expect(onToken).toHaveBeenCalledTimes(3);
      expect(onToken).toHaveBeenNthCalledWith(1, 'A', 1);
      expect(onToken).toHaveBeenNthCalledWith(2, 'B', 2);
      expect(onToken).toHaveBeenNthCalledWith(3, 'C', 3);
    });
  });

  describe('edge cases', () => {
    it('should handle empty stream', async () => {
      // Arrange
      mockReader.read.mockResolvedValueOnce({ done: true, value: undefined });
      const parseLine = vi.fn();
      const onToken = vi.fn();

      // Act
      const result = await processSSEStream(mockResponse, parseLine, onToken, 'TestService');

      // Assert
      expect(result).toBe('');
      expect(onToken).not.toHaveBeenCalled();
      expect(parseLine).not.toHaveBeenCalled();
    });

    it('should handle chunk with only newlines', async () => {
      // Arrange
      const chunk = new TextEncoder().encode('\n\n\n');
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk });
      mockReader.read.mockResolvedValueOnce({ done: true, value: undefined });
      const parseLine = vi.fn((line: string) => line.startsWith('data: ') ? line.slice(6) : null);
      const onToken = vi.fn();

      // Act
      const result = await processSSEStream(mockResponse, parseLine, onToken, 'TestService');

      // Assert
      expect(result).toBe('');
      expect(onToken).not.toHaveBeenCalled();
    });

    it('should handle chunk split across multiple reads', async () => {
      // Arrange
      const chunk1 = new TextEncoder().encode('data: Hel');
      const chunk2 = new TextEncoder().encode('lo\n\n');
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk1 });
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk2 });
      mockReader.read.mockResolvedValueOnce({ done: true, value: undefined });
      const parseLine = vi.fn((line: string) => line.startsWith('data: ') ? line.slice(6) : null);
      const onToken = vi.fn();

      // Act
      const result = await processSSEStream(mockResponse, parseLine, onToken, 'TestService');

      // Assert
      expect(result).toBe('Hello');
      expect(onToken).toHaveBeenCalledWith('Hello', 5);
    });

    it('should handle multiple lines in single chunk', async () => {
      // Arrange
      const chunk = new TextEncoder().encode('data: A\n\ndata: B\n\ndata: C\n\n');
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk });
      mockReader.read.mockResolvedValueOnce({ done: true, value: undefined });
      const parseLine = vi.fn((line: string) => line.startsWith('data: ') ? line.slice(6) : null);
      const onToken = vi.fn();

      // Act
      const result = await processSSEStream(mockResponse, parseLine, onToken, 'TestService');

      // Assert
      expect(result).toBe('ABC');
      expect(onToken).toHaveBeenCalledTimes(3);
    });

    it('should handle very long tokens', async () => {
      // Arrange
      const longToken = 'x'.repeat(10000);
      const chunk = new TextEncoder().encode(`data: ${longToken}\n\n`);
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk });
      mockReader.read.mockResolvedValueOnce({ done: true, value: undefined });
      const parseLine = vi.fn((line: string) => line.startsWith('data: ') ? line.slice(6) : null);
      const onToken = vi.fn();

      // Act
      const result = await processSSEStream(mockResponse, parseLine, onToken, 'TestService');

      // Assert
      expect(result).toBe(longToken);
      expect(onToken).toHaveBeenCalledWith(longToken, 10000);
    });

    it('should handle unicode characters in tokens', async () => {
      // Arrange
      const chunk = new TextEncoder().encode('data: Hello 世界 🌍\n\n');
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk });
      mockReader.read.mockResolvedValueOnce({ done: true, value: undefined });
      const parseLine = vi.fn((line: string) => line.startsWith('data: ') ? line.slice(6) : null);
      const onToken = vi.fn();

      // Act
      const result = await processSSEStream(mockResponse, parseLine, onToken, 'TestService');

      // Assert
      expect(result).toBe('Hello 世界 🌍');
      expect(onToken).toHaveBeenCalledWith('Hello 世界 🌍', 11);
    });

    it('should handle special characters in tokens', async () => {
      // Arrange
      const chunk = new TextEncoder().encode('data: Hello\\nWorld\\t!@#$%\n\n');
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk });
      mockReader.read.mockResolvedValueOnce({ done: true, value: undefined });
      const parseLine = vi.fn((line: string) => line.startsWith('data: ') ? line.slice(6) : null);
      const onToken = vi.fn();

      // Act
      const result = await processSSEStream(mockResponse, parseLine, onToken, 'TestService');

      // Assert
      expect(result).toBe('Hello\\nWorld\\t!@#$%');
    });

    it('should handle tokens with null parser return', async () => {
      // Arrange
      const chunk = new TextEncoder().encode('event: start\ndata: Hello\nevent: end\n\n');
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk });
      mockReader.read.mockResolvedValueOnce({ done: true, value: undefined });
      const parseLine = vi.fn((line: string) => line.startsWith('data: ') ? line.slice(6) : null);
      const onToken = vi.fn();

      // Act
      const result = await processSSEStream(mockResponse, parseLine, onToken, 'TestService');

      // Assert
      expect(result).toBe('Hello');
      expect(onToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should throw error when response body is null', async () => {
      // Arrange
      const nullBodyResponse = { body: null } as any;
      const parseLine = vi.fn();
      const onToken = vi.fn();

      // Act & Assert
      await expect(
        processSSEStream(nullBodyResponse, parseLine, onToken, 'TestService')
      ).rejects.toThrow('TestService: response body is null');
    });

    it('should throw error when response body has no reader', async () => {
      // Arrange - body exists but getReader returns null/undefined
      const noReaderResponse = { body: { getReader: () => null } } as any;
      const parseLine = vi.fn();
      const onToken = vi.fn();

      // Act & Assert
      await expect(
        processSSEStream(noReaderResponse, parseLine, onToken, 'TestService')
      ).rejects.toThrow('TestService: response body is null');
    });

    it('should handle read errors', async () => {
      // Arrange
      mockReader.read.mockRejectedValue(new Error('Read failed'));
      const parseLine = vi.fn();
      const onToken = vi.fn();

      // Act & Assert
      await expect(
        processSSEStream(mockResponse, parseLine, onToken, 'TestService')
      ).rejects.toThrow('Read failed');
    });

    it('should include service name in error message', async () => {
      // Arrange
      const nullBodyResponse = { body: null } as any;
      const parseLine = vi.fn();
      const onToken = vi.fn();

      // Act & Assert
      await expect(
        processSSEStream(nullBodyResponse, parseLine, onToken, 'OpenRouter')
      ).rejects.toThrow('OpenRouter: response body is null');
    });
  });

  describe('buffer handling', () => {
    it('should handle incomplete line at end of chunk', async () => {
      // Arrange
      const chunk1 = new TextEncoder().encode('data: Hel');
      const chunk2 = new TextEncoder().encode('lo\n\n');
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk1 });
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk2 });
      mockReader.read.mockResolvedValueOnce({ done: true, value: undefined });
      const parseLine = vi.fn((line: string) => line.startsWith('data: ') ? line.slice(6) : null);
      const onToken = vi.fn();

      // Act
      const result = await processSSEStream(mockResponse, parseLine, onToken, 'TestService');

      // Assert
      expect(result).toBe('Hello');
      expect(onToken).toHaveBeenCalledWith('Hello', 5);
    });

    it('should handle multiple incomplete lines', async () => {
      // Arrange
      const chunk1 = new TextEncoder().encode('data: A\ndata: B\ndata: C');
      const chunk2 = new TextEncoder().encode('\n\n');
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk1 });
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk2 });
      mockReader.read.mockResolvedValueOnce({ done: true, value: undefined });
      const parseLine = vi.fn((line: string) => line.startsWith('data: ') ? line.slice(6) : null);
      const onToken = vi.fn();

      // Act
      const result = await processSSEStream(mockResponse, parseLine, onToken, 'TestService');

      // Assert
      expect(result).toBe('ABC');
      expect(onToken).toHaveBeenCalledTimes(3);
    });

    it('should preserve buffer across multiple chunks', async () => {
      // Arrange
      const chunk1 = new TextEncoder().encode('data: Hel');
      const chunk2 = new TextEncoder().encode('lo\n\ndata: ');
      const chunk3 = new TextEncoder().encode('World\n\n');
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk1 });
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk2 });
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk3 });
      mockReader.read.mockResolvedValueOnce({ done: true, value: undefined });
      const parseLine = vi.fn((line: string) => line.startsWith('data: ') ? line.slice(6) : null);
      const onToken = vi.fn();

      // Act
      const result = await processSSEStream(mockResponse, parseLine, onToken, 'TestService');

      // Assert
      expect(result).toBe('HelloWorld');
      expect(onToken).toHaveBeenCalledTimes(2);
    });
  });

  describe('callback behavior', () => {
    it('should call onToken with correct total length', async () => {
      // Arrange
      const chunk1 = new TextEncoder().encode('data: A\n\n');
      const chunk2 = new TextEncoder().encode('data: BB\n\n');
      const chunk3 = new TextEncoder().encode('data: CCC\n\n');
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk1 });
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk2 });
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk3 });
      mockReader.read.mockResolvedValueOnce({ done: true, value: undefined });
      const parseLine = vi.fn((line: string) => line.startsWith('data: ') ? line.slice(6) : null);
      const onToken = vi.fn();

      // Act
      await processSSEStream(mockResponse, parseLine, onToken, 'TestService');

      // Assert
      expect(onToken).toHaveBeenNthCalledWith(1, 'A', 1);
      expect(onToken).toHaveBeenNthCalledWith(2, 'BB', 3);
      expect(onToken).toHaveBeenNthCalledWith(3, 'CCC', 6);
    });

    it('should call parseLine for each line', async () => {
      // Arrange
      const chunk = new TextEncoder().encode('event: start\ndata: Hello\nevent: end\ndata: World\n\n');
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk });
      mockReader.read.mockResolvedValueOnce({ done: true, value: undefined });
      const parseLine = vi.fn((line: string) => line.startsWith('data: ') ? line.slice(6) : null);
      const onToken = vi.fn();

      // Act
      await processSSEStream(mockResponse, parseLine, onToken, 'TestService');

      // Assert
      expect(parseLine).toHaveBeenCalledTimes(5);
      expect(parseLine).toHaveBeenNthCalledWith(1, 'event: start');
      expect(parseLine).toHaveBeenNthCalledWith(2, 'data: Hello');
      expect(parseLine).toHaveBeenNthCalledWith(3, 'event: end');
      expect(parseLine).toHaveBeenNthCalledWith(4, 'data: World');
      expect(parseLine).toHaveBeenNthCalledWith(5, '');
    });

    it('should handle parser throwing errors', async () => {
      // Arrange
      const chunk = new TextEncoder().encode('data: Hello\n\n');
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk });
      mockReader.read.mockResolvedValueOnce({ done: true, value: undefined });
      const parseLine = vi.fn(() => {
        throw new Error('Parser error');
      });
      const onToken = vi.fn();

      // Act & Assert
      await expect(
        processSSEStream(mockResponse, parseLine, onToken, 'TestService')
      ).rejects.toThrow('Parser error');
    });

    it('should handle onToken throwing errors', async () => {
      // Arrange
      const chunk = new TextEncoder().encode('data: Hello\n\n');
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk });
      mockReader.read.mockResolvedValueOnce({ done: true, value: undefined });
      const parseLine = vi.fn((line: string) => line.startsWith('data: ') ? line.slice(6) : null);
      const onToken = vi.fn(() => {
        throw new Error('Callback error');
      });

      // Act & Assert
      await expect(
        processSSEStream(mockResponse, parseLine, onToken, 'TestService')
      ).rejects.toThrow('Callback error');
    });
  });

  describe('performance', () => {
    it('should handle large number of small chunks', async () => {
      // Arrange
      const chunks = [];
      for (let i = 0; i < 100; i++) {
        chunks.push(new TextEncoder().encode('data: x\n\n'));
      }
      chunks.forEach((chunk, index) => {
        if (index === chunks.length - 1) {
          mockReader.read.mockResolvedValueOnce({ done: false, value: chunk });
        } else {
          mockReader.read.mockResolvedValueOnce({ done: false, value: chunk });
        }
      });
      mockReader.read.mockResolvedValueOnce({ done: true, value: undefined });
      const parseLine = vi.fn((line: string) => line.startsWith('data: ') ? line.slice(6) : null);
      const onToken = vi.fn();

      // Act
      const result = await processSSEStream(mockResponse, parseLine, onToken, 'TestService');

      // Assert
      expect(result).toBe('x'.repeat(100));
      expect(onToken).toHaveBeenCalledTimes(100);
    });

    it('should handle single large chunk', async () => {
      // Arrange
      const largeContent = 'data: ' + 'x'.repeat(50000) + '\n\n';
      const chunk = new TextEncoder().encode(largeContent);
      mockReader.read.mockResolvedValueOnce({ done: false, value: chunk });
      mockReader.read.mockResolvedValueOnce({ done: true, value: undefined });
      const parseLine = vi.fn((line: string) => line.startsWith('data: ') ? line.slice(6) : null);
      const onToken = vi.fn();

      // Act
      const result = await processSSEStream(mockResponse, parseLine, onToken, 'TestService');

      // Assert
      expect(result).toBe('x'.repeat(50000));
      expect(onToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('different service names', () => {
    it('should work with OpenRouter service name', async () => {
      // Arrange
      const nullBodyResponse = { body: null } as any;
      const parseLine = vi.fn();
      const onToken = vi.fn();

      // Act & Assert
      await expect(
        processSSEStream(nullBodyResponse, parseLine, onToken, 'OpenRouter')
      ).rejects.toThrow('OpenRouter: response body is null');
    });

    it('should work with Modal service name', async () => {
      // Arrange
      const nullBodyResponse = { body: null } as any;
      const parseLine = vi.fn();
      const onToken = vi.fn();

      // Act & Assert
      await expect(
        processSSEStream(nullBodyResponse, parseLine, onToken, 'Modal')
      ).rejects.toThrow('Modal: response body is null');
    });

    it('should work with custom service name', async () => {
      // Arrange
      const nullBodyResponse = { body: null } as any;
      const parseLine = vi.fn();
      const onToken = vi.fn();

      // Act & Assert
      await expect(
        processSSEStream(nullBodyResponse, parseLine, onToken, 'CustomService')
      ).rejects.toThrow('CustomService: response body is null');
    });
  });
});
