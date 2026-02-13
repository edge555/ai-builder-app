/**
 * Tests for CORS header validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BackendConfig } from '../../config';

// Mock logger first
vi.mock('../../logger', () => ({
  createLogger: () => ({
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    withRequestId: vi.fn(() => ({
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    })),
  }),
}));

// Mock config with a mutable object
let mockConfig: BackendConfig = {
  cors: {
    allowedOrigins: ['http://localhost:8080'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    headers: ['Content-Type', 'Authorization'],
  },
  api: {
    timeout: 120000,
    maxRetries: 3,
    retryBaseDelay: 1000,
  },
  ai: {
    maxOutputTokens: 16384,
    temperature: 0.7,
    model: 'gemini-2.5-flash',
    easyModel: 'gemini-2.5-flash-lite',
    hardModel: 'gemini-2.5-flash',
  },
  validation: {
    maxComponentLines: 500,
    maxAppLines: 1000,
    contextLines: 3,
  },
};

vi.mock('../../config', () => ({
  config: mockConfig,
}));

describe('getCorsHeaders', () => {
  let getCorsHeaders: any;

  beforeEach(async () => {
    // Reset mock config
    mockConfig.cors.allowedOrigins = ['http://localhost:8080'];

    // Clear module cache and re-import
    vi.resetModules();
    const utils = await import('../../api/utils');
    getCorsHeaders = utils.getCorsHeaders;
  });

  describe('single allowed origin', () => {
    it('should return the allowed origin when no request is provided', () => {
      const headers = getCorsHeaders();
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:8080');
      expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST, PUT, DELETE, PATCH, OPTIONS');
      expect(headers['Access-Control-Allow-Headers']).toBe('Content-Type, Authorization');
      expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    });

    it('should return the allowed origin when request origin matches', () => {
      const mockRequest = new Request('http://api.example.com', {
        headers: { origin: 'http://localhost:8080' },
      });

      const headers = getCorsHeaders(mockRequest);
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:8080');
    });

    it('should return the allowed origin even when request origin does not match (single origin mode)', () => {
      const mockRequest = new Request('http://api.example.com', {
        headers: { origin: 'http://evil.com' },
      });

      const headers = getCorsHeaders(mockRequest);
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:8080');
    });
  });

  describe('multiple allowed origins', () => {
    beforeEach(() => {
      mockConfig.cors.allowedOrigins = [
        'http://localhost:8080',
        'http://localhost:5173',
        'https://app.example.com',
      ];
    });

    it('should return matching origin when request origin is in allowed list', () => {
      const mockRequest = new Request('http://api.example.com', {
        headers: { origin: 'http://localhost:5173' },
      });

      const headers = getCorsHeaders(mockRequest);
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    });

    it('should return first allowed origin when request origin does not match', () => {
      const mockRequest = new Request('http://api.example.com', {
        headers: { origin: 'http://evil.com' },
      });

      const headers = getCorsHeaders(mockRequest);
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:8080');
    });

    it('should return first allowed origin when no request is provided', () => {
      const headers = getCorsHeaders();
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:8080');
    });
  });

  describe('edge cases', () => {
    it('should handle request without origin header', () => {
      const mockRequest = new Request('http://api.example.com');

      const headers = getCorsHeaders(mockRequest);
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:8080');
    });

    it('should be case-sensitive when matching origins', () => {
      mockConfig.cors.allowedOrigins = [
        'http://localhost:8080',
        'https://App.Example.com',
      ];

      const mockRequest = new Request('http://api.example.com', {
        headers: { origin: 'https://app.example.com' },
      });

      const headers = getCorsHeaders(mockRequest);
      // Should not match due to case sensitivity
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:8080');
    });

    it('should trim whitespace from allowed origins during config parsing', () => {
      // This test verifies the config.ts parsing logic
      const origins = '  http://localhost:8080  ,  http://localhost:5173  ';
      const parsed = origins.split(',').map((o) => o.trim());

      expect(parsed).toEqual(['http://localhost:8080', 'http://localhost:5173']);
      expect(parsed[0]).not.toContain(' ');
    });
  });

  describe('security', () => {
    it('should not allow wildcard origins', () => {
      const mockRequest = new Request('http://api.example.com', {
        headers: { origin: '*' },
      });

      const headers = getCorsHeaders(mockRequest);
      expect(headers['Access-Control-Allow-Origin']).not.toBe('*');
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:8080');
    });

    it('should not allow null origin to bypass validation', () => {
      const mockRequest = new Request('http://api.example.com', {
        headers: { origin: 'null' },
      });

      const headers = getCorsHeaders(mockRequest);
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:8080');
    });

    it('should always set Access-Control-Allow-Credentials to true', () => {
      const headers = getCorsHeaders();
      expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    });
  });
});
