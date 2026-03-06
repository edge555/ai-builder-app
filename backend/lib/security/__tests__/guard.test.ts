import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------- Mocks (must be hoisted before imports) ----------

vi.mock('../../logger', () => ({
  createLogger: () => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('next/server', () => ({
  NextRequest: class {
    headers: Headers;
    method: string;
    ip: string | undefined;
    constructor(url: string, init?: { method?: string; headers?: Record<string, string> }) {
      this.headers = new Headers(init?.headers ?? {});
      this.method = init?.method ?? 'GET';
      this.ip = undefined;
    }
  },
}));

// Default config mock — rate limiting enabled
const mockConfig = {
  rateLimit: {
    enabled: true,
    windowMs: 60_000,
    highCostMax: 5,
    mediumCostMax: 10,
    lowCostMax: 60,
    configMax: 20,
  },
  cors: {
    allowedOrigins: ['http://localhost:8080'],
    methods: ['GET', 'POST'],
    headers: ['Content-Type'],
  },
};

vi.mock('../../config', () => ({ config: mockConfig }));

vi.mock('../../api/utils', () => ({
  getCorsHeaders: () => ({ 'Access-Control-Allow-Origin': 'http://localhost:8080' }),
}));

// ---------- Now import the module under test ----------

import { RateLimiter, setRateLimiter } from '../rate-limiter';
import { applyRateLimit } from '../guard';
import { RateLimitTier } from '../rate-limit-config';

// ---------- Helpers ----------

function makeRequest(options: {
  method?: string;
  headers?: Record<string, string>;
  ip?: string;
} = {}) {
  const req = {
    method: options.method ?? 'POST',
    ip: options.ip ?? '1.2.3.4',
    headers: new Headers(options.headers ?? {}),
  };
  return req as any;
}

async function parseBody(response: Response) {
  return response.json();
}

// ---------- Tests ----------

describe('applyRateLimit()', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(999_999_999);
    setRateLimiter(limiter);
    mockConfig.rateLimit.enabled = true;
  });

  afterEach(() => {
    limiter.destroy();
    setRateLimiter(null);
  });

  describe('when rate limiting is disabled', () => {
    it('returns null regardless of request count', () => {
      mockConfig.rateLimit.enabled = false;

      for (let i = 0; i < 100; i++) {
        const result = applyRateLimit(makeRequest(), RateLimitTier.HIGH_COST);
        expect(result).toBeNull();
      }
    });
  });

  describe('allowed requests', () => {
    it('returns null when request is within limit', () => {
      const result = applyRateLimit(makeRequest(), RateLimitTier.HIGH_COST);
      expect(result).toBeNull();
    });

    it('returns null for GET requests regardless of content-length', () => {
      const req = makeRequest({ method: 'GET' });
      const result = applyRateLimit(req, RateLimitTier.LOW_COST);
      expect(result).toBeNull();
    });
  });

  describe('rate limit exceeded (429)', () => {
    it('returns 429 after HIGH_COST limit is hit', async () => {
      const limit = mockConfig.rateLimit.highCostMax; // 5

      for (let i = 0; i < limit; i++) {
        applyRateLimit(makeRequest(), RateLimitTier.HIGH_COST);
      }

      const result = applyRateLimit(makeRequest(), RateLimitTier.HIGH_COST);
      expect(result).not.toBeNull();
      expect(result!.status).toBe(429);
    });

    it('includes Retry-After header in 429 response', async () => {
      const limit = mockConfig.rateLimit.highCostMax;

      for (let i = 0; i < limit; i++) {
        applyRateLimit(makeRequest(), RateLimitTier.HIGH_COST);
      }

      const result = applyRateLimit(makeRequest(), RateLimitTier.HIGH_COST);
      expect(result!.headers.get('Retry-After')).toBeTruthy();
    });

    it('includes X-RateLimit-* headers in 429 response', async () => {
      const limit = mockConfig.rateLimit.highCostMax;

      for (let i = 0; i < limit; i++) {
        applyRateLimit(makeRequest(), RateLimitTier.HIGH_COST);
      }

      const result = applyRateLimit(makeRequest(), RateLimitTier.HIGH_COST);
      expect(result!.headers.get('X-RateLimit-Limit')).toBe(String(limit));
      expect(result!.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(result!.headers.get('X-RateLimit-Reset')).toBeTruthy();
    });

    it('returns error body with rate_limit type', async () => {
      const limit = mockConfig.rateLimit.highCostMax;
      for (let i = 0; i < limit; i++) {
        applyRateLimit(makeRequest(), RateLimitTier.HIGH_COST);
      }

      const result = applyRateLimit(makeRequest(), RateLimitTier.HIGH_COST);
      const body = await parseBody(result!);
      expect(body.success).toBe(false);
      expect(body.error.type).toBe('rate_limit');
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('tracks different IPs independently', () => {
      const limit = mockConfig.rateLimit.highCostMax;
      for (let i = 0; i < limit; i++) {
        applyRateLimit(makeRequest({ ip: '1.1.1.1' }), RateLimitTier.HIGH_COST);
      }

      // Different IP should still be allowed
      const result = applyRateLimit(makeRequest({ ip: '2.2.2.2' }), RateLimitTier.HIGH_COST);
      expect(result).toBeNull();
    });

    it('uses X-Forwarded-For header when present', () => {
      const limit = mockConfig.rateLimit.highCostMax;
      const headers = { 'x-forwarded-for': '10.0.0.1, 192.168.1.1' };

      for (let i = 0; i < limit; i++) {
        applyRateLimit(makeRequest({ headers }), RateLimitTier.HIGH_COST);
      }

      // Same forwarded IP should be blocked
      const result = applyRateLimit(makeRequest({ headers }), RateLimitTier.HIGH_COST);
      expect(result?.status).toBe(429);

      // Different forwarded IP should be allowed
      const result2 = applyRateLimit(
        makeRequest({ headers: { 'x-forwarded-for': '99.0.0.1' } }),
        RateLimitTier.HIGH_COST
      );
      expect(result2).toBeNull();
    });
  });

  describe('body size exceeded (413)', () => {
    it('returns 413 when Content-Length exceeds tier limit', async () => {
      // HIGH_COST limit is 2 MB (2_097_152 bytes)
      const req = makeRequest({
        method: 'POST',
        headers: { 'content-length': String(3 * 1024 * 1024) }, // 3 MB
      });

      const result = applyRateLimit(req, RateLimitTier.HIGH_COST);
      expect(result).not.toBeNull();
      expect(result!.status).toBe(413);
    });

    it('returns null when Content-Length is within tier limit', () => {
      const req = makeRequest({
        method: 'POST',
        headers: { 'content-length': String(1 * 1024 * 1024) }, // 1 MB (under 2 MB)
      });

      const result = applyRateLimit(req, RateLimitTier.HIGH_COST);
      expect(result).toBeNull();
    });

    it('returns null when Content-Length header is absent', () => {
      const req = makeRequest({ method: 'POST' }); // no content-length
      const result = applyRateLimit(req, RateLimitTier.HIGH_COST);
      expect(result).toBeNull();
    });

    it('returns error body with PAYLOAD_TOO_LARGE code', async () => {
      const req = makeRequest({
        method: 'POST',
        headers: { 'content-length': String(3 * 1024 * 1024) },
      });

      const result = applyRateLimit(req, RateLimitTier.HIGH_COST);
      const body = await parseBody(result!);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('enforces CONFIG tier body limit (64 KB)', async () => {
      const req = makeRequest({
        method: 'PUT',
        headers: { 'content-length': String(128 * 1024) }, // 128 KB > 64 KB
      });

      const result = applyRateLimit(req, RateLimitTier.CONFIG);
      expect(result?.status).toBe(413);
    });
  });
});
