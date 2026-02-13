/**
 * Tests for Logger with Request Correlation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../logger';

describe('Logger with Request Correlation', () => {
  let consoleLogSpy: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Set log level to debug for testing
    process.env.LOG_LEVEL = 'debug';
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    delete process.env.LOG_LEVEL;
  });

  describe('withRequestId', () => {
    it('should create child logger with request ID', () => {
      const logger = createLogger('test-service');
      const childLogger = logger.withRequestId('req_123_abc');

      childLogger.info('Test message');

      expect(consoleLogSpy).toHaveBeenCalled();
      const logOutput = consoleLogSpy.mock.calls[0][0];
      expect(logOutput).toContain('[req_123_abc]');
      expect(logOutput).toContain('Test message');
      expect(logOutput).toContain('[test-service]');
    });

    it('should include request ID in all log levels', () => {
      const logger = createLogger('test-service');
      const childLogger = logger.withRequestId('req_456_def');

      childLogger.debug('Debug message');
      childLogger.info('Info message');
      childLogger.warn('Warn message');
      childLogger.error('Error message');

      // Check debug log
      expect(consoleLogSpy).toHaveBeenCalledTimes(2); // debug and info
      expect(consoleLogSpy.mock.calls[0][0]).toContain('[req_456_def]');
      expect(consoleLogSpy.mock.calls[1][0]).toContain('[req_456_def]');

      // Check warn log
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('[req_456_def]');

      // Check error log
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[req_456_def]');
    });

    it('should include context along with request ID', () => {
      const logger = createLogger('test-service');
      const childLogger = logger.withRequestId('req_789_ghi');

      childLogger.info('Processing request', { userId: 123, action: 'create' });

      expect(consoleLogSpy).toHaveBeenCalled();
      const logOutput = consoleLogSpy.mock.calls[0][0];
      expect(logOutput).toContain('[req_789_ghi]');
      expect(logOutput).toContain('Processing request');
      expect(logOutput).toContain('"userId":123');
      expect(logOutput).toContain('"action":"create"');
    });
  });

  describe('logger without request ID', () => {
    it('should log without request ID prefix', () => {
      const logger = createLogger('test-service');

      logger.info('Test message');

      expect(consoleLogSpy).toHaveBeenCalled();
      const logOutput = consoleLogSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('[req_');
      expect(logOutput).toContain('[test-service]');
      expect(logOutput).toContain('Test message');
    });
  });

  describe('createLogger with initial requestId', () => {
    it('should create logger with request ID from start', () => {
      const logger = createLogger('test-service', 'req_initial_xyz');

      logger.info('Test message');

      expect(consoleLogSpy).toHaveBeenCalled();
      const logOutput = consoleLogSpy.mock.calls[0][0];
      expect(logOutput).toContain('[req_initial_xyz]');
      expect(logOutput).toContain('[test-service]');
    });

    it('should allow creating child logger with different request ID', () => {
      const logger = createLogger('test-service', 'req_parent_123');
      const childLogger = logger.withRequestId('req_child_456');

      childLogger.info('Test message');

      expect(consoleLogSpy).toHaveBeenCalled();
      const logOutput = consoleLogSpy.mock.calls[0][0];
      expect(logOutput).toContain('[req_child_456]');
      expect(logOutput).not.toContain('[req_parent_123]');
    });
  });

  describe('log level filtering with request ID', () => {
    it('should respect log level with request ID logger', () => {
      process.env.LOG_LEVEL = 'warn';
      const logger = createLogger('test-service');
      const childLogger = logger.withRequestId('req_123_abc');

      childLogger.debug('Debug message');
      childLogger.info('Info message');
      childLogger.warn('Warn message');
      childLogger.error('Error message');

      // Debug and info should be filtered out
      expect(consoleLogSpy).not.toHaveBeenCalled();

      // Warn and error should be logged
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('timestamp format', () => {
    it('should include ISO timestamp in log output', () => {
      const logger = createLogger('test-service');
      const childLogger = logger.withRequestId('req_123_abc');

      childLogger.info('Test message');

      expect(consoleLogSpy).toHaveBeenCalled();
      const logOutput = consoleLogSpy.mock.calls[0][0];

      // Check for ISO timestamp format [YYYY-MM-DDTHH:mm:ss.sssZ]
      expect(logOutput).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
    });
  });
});
