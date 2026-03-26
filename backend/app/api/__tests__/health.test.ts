/**
 * Tests for health API endpoint
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('../../../lib/security', () => ({
  applyRateLimit: vi.fn().mockResolvedValue({ blocked: null, headers: {} }),
  RateLimitTier: { LOW_COST: 'LOW_COST' },
}));

vi.mock('../../../lib/config', () => ({
  config: {
    provider: { name: 'openrouter', openrouterApiKey: 'test-key' },
    rateLimit: { enabled: true },
  },
}));

vi.mock('../../../lib/api', () => ({
  getCorsHeaders: vi.fn().mockReturnValue({ 'Access-Control-Allow-Origin': '*' }),
  handleOptions: vi.fn(() => new Response(null, { status: 204 })),
}));

vi.mock('../../../lib/metrics', () => ({
  getMetricsSummary: vi.fn().mockReturnValue({ totalRequests: 0 }),
}));

import { GET, OPTIONS } from '../health/route';

describe('Health API', () => {
  let mockRequest: { url: string; headers: Headers; ip?: string };

  beforeEach(() => {
    mockRequest = { url: 'http://localhost:4000/api/health', headers: new Headers() };
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
      const response = await GET(mockRequest as unknown as NextRequest);
      expect(response.status).toBe(200);
    });

    it('returns status: ok', async () => {
      const response = await GET(mockRequest as unknown as NextRequest);
      const body = await response.json();
      expect(body.status).toBe('ok');
    });

    it('returns ISO timestamp', async () => {
      const response = await GET(mockRequest as unknown as NextRequest);
      const body = await response.json();
      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('returns provider name', async () => {
      const response = await GET(mockRequest as unknown as NextRequest);
      const body = await response.json();
      expect(body.provider).toBe('openrouter');
    });

    it('returns rateLimiter info', async () => {
      const response = await GET(mockRequest as unknown as NextRequest);
      const body = await response.json();
      expect(body.rateLimiter).toEqual({ enabled: true });
    });

    it('returns CORS headers', async () => {
      const response = await GET(mockRequest as unknown as NextRequest);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
    });

    it('responds quickly (under 100ms)', async () => {
      const start = Date.now();
      await GET(mockRequest as unknown as NextRequest);
      expect(Date.now() - start).toBeLessThan(100);
    });

    it('handles concurrent requests', async () => {
      const responses = await Promise.all(
        Array.from({ length: 5 }, () => GET(mockRequest as unknown as NextRequest))
      );
      responses.forEach((r) => expect(r.status).toBe(200));
    });

    it('does not include providerCheck or keyCheck without ?deep=true', async () => {
      const response = await GET(mockRequest as unknown as NextRequest);
      const body = await response.json();
      expect(body.providerCheck).toBeUndefined();
      expect(body.keyCheck).toBeUndefined();
    });

    describe('?deep=true — key validity probe', () => {
      let deepRequest: { url: string; headers: Headers };

      beforeEach(() => {
        deepRequest = { url: 'http://localhost:4000/api/health?deep=true', headers: new Headers() };
      });

      it('includes keyCheck field for openrouter', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, ok: true }));

        const response = await GET(deepRequest as unknown as NextRequest);
        const body = await response.json();

        expect(body.keyCheck).toBeDefined();
        vi.unstubAllGlobals();
      });

      it('keyCheck.valid is true when OpenRouter returns 200', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200 }));

        const response = await GET(deepRequest as unknown as NextRequest);
        const body = await response.json();

        expect(body.keyCheck.valid).toBe(true);
        vi.unstubAllGlobals();
      });

      it('keyCheck.valid is false and status degraded when key is invalid (401)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401 }));

        const response = await GET(deepRequest as unknown as NextRequest);
        const body = await response.json();

        expect(body.keyCheck.valid).toBe(false);
        expect(body.keyCheck.error).toMatch(/invalid/);
        expect(body.status).toBe('degraded');
        vi.unstubAllGlobals();
      });
    });
  });
});
