/**
 * Tests for health API endpoint
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../lib/security', () => ({
  applyRateLimit: vi.fn().mockReturnValue(null),
  RateLimitTier: { LOW_COST: 'LOW_COST' },
}));

vi.mock('../../../lib/config', () => ({
  config: {
    provider: { name: 'openrouter' },
    rateLimit: { enabled: true },
  },
}));

vi.mock('../../../lib/api', () => ({
  getCorsHeaders: vi.fn().mockReturnValue({ 'Access-Control-Allow-Origin': '*' }),
  handleOptions: vi.fn(() => new Response(null, { status: 204 })),
}));

import { GET, OPTIONS } from '../health/route';

describe('Health API', () => {
  let mockRequest: { headers: Headers; ip?: string };

  beforeEach(() => {
    mockRequest = { headers: new Headers() };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('OPTIONS /api/health', () => {
    it('returns 204', async () => {
      const response = await OPTIONS();
      expect(response.status).toBe(204);
    });
  });

  describe('GET /api/health', () => {
    it('returns 200', async () => {
      const response = await GET(mockRequest as any);
      expect(response.status).toBe(200);
    });

    it('returns status: ok', async () => {
      const response = await GET(mockRequest as any);
      const body = await response.json();
      expect(body.status).toBe('ok');
    });

    it('returns ISO timestamp', async () => {
      const response = await GET(mockRequest as any);
      const body = await response.json();
      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('returns provider name', async () => {
      const response = await GET(mockRequest as any);
      const body = await response.json();
      expect(body.provider).toBe('openrouter');
    });

    it('returns rateLimiter info', async () => {
      const response = await GET(mockRequest as any);
      const body = await response.json();
      expect(body.rateLimiter).toEqual({ enabled: true });
    });

    it('returns CORS headers', async () => {
      const response = await GET(mockRequest as any);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
    });

    it('responds quickly (under 100ms)', async () => {
      const start = Date.now();
      await GET(mockRequest as any);
      expect(Date.now() - start).toBeLessThan(100);
    });

    it('handles concurrent requests', async () => {
      const responses = await Promise.all(
        Array.from({ length: 5 }, () => GET(mockRequest as any))
      );
      responses.forEach((r) => expect(r.status).toBe(200));
    });
  });
});
