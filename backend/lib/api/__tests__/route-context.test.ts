/**
 * Tests for route-context module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRouteContext, withRouteContext } from '../route-context';
import type { NextRequest } from 'next/server';

// Mock the logger
vi.mock('../../logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: vi.fn(function(this: any, requestId: string) {
      return { ...this, requestId };
    }),
  })),
}));

// Mock the request-id module
vi.mock('../../request-id', () => ({
  generateRequestId: vi.fn(() => 'req_1234567890_abcdefgh'),
}));

function makeMockRequest(overrides: Partial<NextRequest> = {}): NextRequest {
  return {
    method: 'GET',
    url: 'http://localhost:4000/api/test',
    headers: new Headers(),
    ...overrides,
  } as unknown as NextRequest;
}

describe('route-context', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset generateRequestId mock to return fixed value after any per-test overrides
    const { generateRequestId } = await import('../../request-id');
    vi.mocked(generateRequestId).mockReturnValue('req_1234567890_abcdefgh');
  });

  describe('createRouteContext', () => {
    it('should create a route context with request ID', () => {
      const context = createRouteContext('api/test');

      expect(context.requestId).toBe('req_1234567890_abcdefgh');
      expect(context.contextLogger).toBeDefined();
    });

    it('should create context logger with request ID correlation', () => {
      const context = createRouteContext('api/my-route');

      expect(context.contextLogger).toHaveProperty('requestId', 'req_1234567890_abcdefgh');
    });

    it('should generate unique request IDs for each call', async () => {
      const requestModule = await import('../../request-id');
      vi.mocked(requestModule.generateRequestId)
        .mockReturnValueOnce('req_1_abcdefgh')
        .mockReturnValueOnce('req_2_abcdefgh');

      const context1 = createRouteContext('api/test1');
      const context2 = createRouteContext('api/test2');

      expect(context1.requestId).not.toBe(context2.requestId);
    });

    it('should accept different module names', () => {
      const modules = ['api/health', 'api/generate', 'api/diff', 'api/versions'];

      modules.forEach(module => {
        const context = createRouteContext(module);
        expect(context.requestId).toBeDefined();
      });
    });

    it('should support setRateLimitHeaders', () => {
      const context = createRouteContext('api/test');
      context.setRateLimitHeaders({ 'X-RateLimit-Limit': '10' });
      expect(context._rateLimitHeaders).toEqual({ 'X-RateLimit-Limit': '10' });
    });
  });

  describe('withRouteContext', () => {
    it('should wrap handler and provide route context', async () => {
      const mockRequest = makeMockRequest();
      const handler = vi.fn(async (ctx, request) => {
        return new Response('ok', { status: 200 });
      });

      const wrappedHandler = withRouteContext('api/test', handler);
      const response = await wrappedHandler(mockRequest);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req_1234567890_abcdefgh',
          contextLogger: expect.any(Object),
          setRateLimitHeaders: expect.any(Function),
        }),
        mockRequest
      );
      expect(response.status).toBe(200);
    });

    it('should add X-Request-Id header to response', async () => {
      const mockRequest = makeMockRequest();
      const handler = vi.fn(async (ctx, request) => {
        return new Response('ok', { status: 200 });
      });

      const wrappedHandler = withRouteContext('api/test', handler);
      const response = await wrappedHandler(mockRequest);

      expect(response.headers.get('X-Request-Id')).toBe('req_1234567890_abcdefgh');
    });

    it('should not override existing X-Request-Id header', async () => {
      const mockRequest = makeMockRequest();
      const handler = vi.fn(async (ctx, request) => {
        return new Response('ok', {
          status: 200,
          headers: { 'X-Request-Id': 'custom-id' },
        });
      });

      const wrappedHandler = withRouteContext('api/test', handler);
      const response = await wrappedHandler(mockRequest);

      expect(response.headers.get('X-Request-Id')).toBe('custom-id');
    });

    it('should preserve response status and body', async () => {
      const mockRequest = makeMockRequest();
      const handler = vi.fn(async (ctx, request) => {
        return new Response(JSON.stringify({ data: 'test' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const wrappedHandler = withRouteContext('api/test', handler);
      const response = await wrappedHandler(mockRequest);

      expect(response.status).toBe(201);
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    it('should handle handler errors', async () => {
      const mockRequest = makeMockRequest();
      const handler = vi.fn(async (ctx, request) => {
        throw new Error('Handler error');
      });

      const wrappedHandler = withRouteContext('api/test', handler);

      await expect(wrappedHandler(mockRequest)).rejects.toThrow('Handler error');
    });

    it('should pass through request object unchanged', async () => {
      const mockRequest = makeMockRequest({
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
      });

      const handler = vi.fn(async (ctx, request) => {
        return new Response('ok');
      });

      const wrappedHandler = withRouteContext('api/test', handler);
      await wrappedHandler(mockRequest);

      expect(handler).toHaveBeenCalledWith(
        expect.any(Object),
        mockRequest
      );
    });

    it('should preserve other response headers', async () => {
      const mockRequest = makeMockRequest();
      const handler = vi.fn(async (ctx, request) => {
        return new Response('ok', {
          status: 200,
          headers: {
            'Content-Type': 'text/plain',
            'X-Custom-Header': 'custom-value',
          },
        });
      });

      const wrappedHandler = withRouteContext('api/test', handler);
      const response = await wrappedHandler(mockRequest);

      expect(response.headers.get('X-Custom-Header')).toBe('custom-value');
      expect(response.headers.get('Content-Type')).toBe('text/plain');
      expect(response.headers.get('X-Request-Id')).toBe('req_1234567890_abcdefgh');
    });

    it('should work with async handlers that return JSON', async () => {
      const mockRequest = makeMockRequest();
      const handler = vi.fn(async (ctx, request) => {
        return Response.json({ success: true, data: { id: 1 } });
      });

      const wrappedHandler = withRouteContext('api/test', handler);
      const response = await wrappedHandler(mockRequest);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ success: true, data: { id: 1 } });
    });

    it('should merge rate limit headers set via ctx.setRateLimitHeaders', async () => {
      const mockRequest = makeMockRequest();
      const handler = vi.fn(async (ctx, request) => {
        ctx.setRateLimitHeaders({
          'X-RateLimit-Limit': '10',
          'X-RateLimit-Remaining': '9',
        });
        return new Response('ok', { status: 200 });
      });

      const wrappedHandler = withRouteContext('api/test', handler);
      const response = await wrappedHandler(mockRequest);

      expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('9');
    });

    it('should log request completion with status and duration', async () => {
      const mockRequest = makeMockRequest({ method: 'POST' });
      const handler = vi.fn(async (ctx, request) => {
        return new Response('ok', { status: 201 });
      });

      const wrappedHandler = withRouteContext('api/test', handler);
      await wrappedHandler(mockRequest);

      // Verify the context logger was called with request info
      // The logger is mocked, so we verify the withRequestId mock was called
      const { createLogger } = await import('../../logger');
      const mockLogger = vi.mocked(createLogger).mock.results[0].value;
      const contextLogger = mockLogger.withRequestId.mock.results[0].value;
      expect(contextLogger.info).toHaveBeenCalledWith('Request completed', expect.objectContaining({
        method: 'POST',
        path: '/api/test',
        status: 201,
        durationMs: expect.any(Number),
      }));
    });
  });
});
