/**
 * CSRF Protection Tests
 *
 * Verifies that getCorsHeaders with rejectInvalidOrigin: true
 * rejects mutation requests with missing or invalid Origin headers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCorsHeaders } from '../utils';
import { AppError } from '../error';

// Mock the config module
vi.mock('../../config', () => ({
  config: {
    cors: {
      allowedOrigins: ['http://localhost:8080', 'https://app.example.com'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      headers: ['Content-Type', 'Authorization'],
    },
  },
}));

// Mock the logger
vi.mock('../../logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

function makeRequest(method: string, origin?: string): Request {
  const headers = new Headers();
  if (origin) {
    headers.set('origin', origin);
  }
  return {
    method,
    headers,
  } as unknown as Request;
}

describe('CSRF protection via getCorsHeaders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when rejectInvalidOrigin is true', () => {
    const opts = { rejectInvalidOrigin: true };

    it('should allow POST with valid origin', () => {
      const request = makeRequest('POST', 'http://localhost:8080');
      const headers = getCorsHeaders(request, opts);
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:8080');
    });

    it('should allow PUT with valid origin', () => {
      const request = makeRequest('PUT', 'https://app.example.com');
      const headers = getCorsHeaders(request, opts);
      expect(headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
    });

    it('should reject POST with missing origin', () => {
      const request = makeRequest('POST');
      let caughtErr: unknown;
      try { getCorsHeaders(request, opts); } catch (e) { caughtErr = e; }
      expect(caughtErr).toBeInstanceOf(AppError);
      const err = caughtErr as AppError;
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('ORIGIN_REJECTED');
      expect(err.details).toEqual({ origin: 'missing' });
    });

    it('should reject POST with invalid origin', () => {
      const request = makeRequest('POST', 'https://evil.com');
      let caughtErr: unknown;
      try { getCorsHeaders(request, opts); } catch (e) { caughtErr = e; }
      expect(caughtErr).toBeInstanceOf(AppError);
      const err = caughtErr as AppError;
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('ORIGIN_REJECTED');
      expect(err.details).toEqual({ origin: 'https://evil.com' });
    });

    it('should reject PUT with missing origin', () => {
      const request = makeRequest('PUT');
      expect(() => getCorsHeaders(request, opts)).toThrow(AppError);
    });

    it('should reject DELETE with invalid origin', () => {
      const request = makeRequest('DELETE', 'https://evil.com');
      expect(() => getCorsHeaders(request, opts)).toThrow(AppError);
    });

    it('should reject PATCH with invalid origin', () => {
      const request = makeRequest('PATCH', 'https://evil.com');
      expect(() => getCorsHeaders(request, opts)).toThrow(AppError);
    });

    it('should NOT reject GET even with invalid origin', () => {
      const request = makeRequest('GET', 'https://evil.com');
      // GET is not a mutation, so it should not throw
      const headers = getCorsHeaders(request, opts);
      expect(headers['Access-Control-Allow-Origin']).toBeDefined();
    });

    it('should NOT reject OPTIONS even with missing origin', () => {
      const request = makeRequest('OPTIONS');
      const headers = getCorsHeaders(request, opts);
      expect(headers['Access-Control-Allow-Origin']).toBeDefined();
    });
  });

  describe('when rejectInvalidOrigin is false or unset', () => {
    it('should allow POST with invalid origin (no CSRF enforcement)', () => {
      const request = makeRequest('POST', 'https://evil.com');
      const headers = getCorsHeaders(request);
      expect(headers['Access-Control-Allow-Origin']).toBeDefined();
    });

    it('should allow POST with missing origin (no CSRF enforcement)', () => {
      const request = makeRequest('POST');
      const headers = getCorsHeaders(request);
      expect(headers['Access-Control-Allow-Origin']).toBeDefined();
    });

    it('should allow PUT with no options', () => {
      const request = makeRequest('PUT', 'https://evil.com');
      const headers = getCorsHeaders(request, { rejectInvalidOrigin: false });
      expect(headers['Access-Control-Allow-Origin']).toBeDefined();
    });
  });

  describe('with no request', () => {
    it('should return CORS headers when no request is provided', () => {
      const headers = getCorsHeaders();
      expect(headers['Access-Control-Allow-Origin']).toBeDefined();
      expect(headers['Access-Control-Allow-Methods']).toBeDefined();
    });
  });
});
