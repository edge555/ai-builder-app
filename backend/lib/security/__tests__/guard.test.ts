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

vi.mock('../../config', () => ({
  config: {
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
    security: {
      trustedProxyDepth: 1,
    },
  },
}));

vi.mock('../../api/utils', () => ({
  getCorsHeaders: () => ({ 'Access-Control-Allow-Origin': 'http://localhost:8080' }),
}));

// ---------- Now import the module under test ----------

import { RateLimiter, setRateLimiter } from '../rate-limiter';
import { applyRateLimit, getClientIp } from '../guard';
import { RateLimitTier } from '../rate-limit-config';

// ---------- Helpers ----------

function makeRequest(options: {
  method?: string;
  headers?: Record<string, string>;
  ip?: string | undefined;
} = {}) {
  const req = {
    method: options.method ?? 'POST',
    ip: 'ip' in options ? options.ip : '1.2.3.4',
    headers: new Headers(options.headers ?? {}),
  };
  return req as { method: string; ip: string | undefined; headers: Headers };
}

async function parseBody(response: Response) {
  return response.json();
}

// ---------- Tests ----------

describe('getClientIp()', () => {
  it('prefers request.ip over X-Forwarded-For', () => {
    const req = makeRequest({
      ip: '10.0.0.1',
      headers: { 'x-forwarded-for': '203.0.113.5' },
    });
    expect(getClientIp(req)).toBe('10.0.0.1');
  });

  it('uses rightmost IP from X-Forwarded-For (depth=1)', () => {
    const req = makeRequest({
      ip: undefined,
      headers: { 'x-forwarded-for': '10.0.0.1, 203.0.113.5' },
    });
    // depth=1 → last IP
    expect(getClientIp(req)).toBe('203.0.113.5');
  });

  it('prevents spoofing: attacker-prepended IP is ignored', () => {
    const req = makeRequest({
      ip: undefined,
      headers: { 'x-forwarded-for': 'spoofed.ip, real-client, 203.0.113.5' },
    });
    // depth=1 → last IP (set by trusted proxy)
    expect(getClientIp(req)).toBe('203.0.113.5');
  });

  it('uses single IP from X-Forwarded-For when depth=1', () => {
    const req = makeRequest({
      ip: undefined,
      headers: { 'x-forwarded-for': '203.0.113.5' },
    });
    expect(getClientIp(req)).toBe('203.0.113.5');
  });

  it('falls back to unknown when no IP source available', () => {
    const req = makeRequest({ ip: undefined });
    expect(getClientIp(req)).toBe('unknown');
  });

  it('falls back when X-Forwarded-For is malformed', () => {
    const req = makeRequest({
      ip: undefined,
      headers: { 'x-forwarded-for': 'evil;DROP TABLE ips;--' },
    });
    expect(getClientIp(req)).toBe('unknown');
  });

  it('falls back when X-Forwarded-For is empty string', () => {
    const req = makeRequest({
      ip: undefined,
      headers: { 'x-forwarded-for': '' },
    });
    expect(getClientIp(req)).toBe('unknown');
  });

  it('uses valid IPv6 from X-Forwarded-For', () => {
    const req = makeRequest({
      ip: undefined,
      headers: { 'x-forwarded-for': '2001:db8::1' },
    });
    expect(getClientIp(req)).toBe('2001:db8::1');
  });
});

describe('applyRateLimit()', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(999_999_999);
    setRateLimiter(limiter);
  });

  afterEach(() => {
    limiter.destroy();
    setRateLimiter(null);
  });

  describe('when rate limiting is disabled', () => {
    it.todo('returns null regardless of request count — requires dynamic mock config (vi.doMock)');
  });

  describe('allowed requests', () => {
    it('returns blocked=null when request is within limit', () => {
      const { blocked } = applyRateLimit(makeRequest(), RateLimitTier.HIGH_COST);
      expect(blocked).toBeNull();
    });

    it('returns rate limit headers on allowed requests', () => {
      const { blocked, headers } = applyRateLimit(makeRequest(), RateLimitTier.HIGH_COST);
      expect(blocked).toBeNull();
      expect(headers['X-RateLimit-Limit']).toBe('5');
      expect(headers['X-RateLimit-Remaining']).toBe('4');
      expect(headers['X-RateLimit-Reset']).toBeTruthy();
    });

    it('returns blocked=null for GET requests regardless of content-length', () => {
      const req = makeRequest({ method: 'GET' });
      const { blocked } = applyRateLimit(req, RateLimitTier.LOW_COST);
      expect(blocked).toBeNull();
    });
  });

  describe('rate limit exceeded (429)', () => {
    it('returns 429 after HIGH_COST limit is hit', async () => {
      const limit = 5;

      for (let i = 0; i < limit; i++) {
        applyRateLimit(makeRequest(), RateLimitTier.HIGH_COST);
      }

      const { blocked } = applyRateLimit(makeRequest(), RateLimitTier.HIGH_COST);
      expect(blocked).not.toBeNull();
      expect(blocked!.status).toBe(429);
    });

    it('includes Retry-After header in 429 response', async () => {
      const limit = 5;

      for (let i = 0; i < limit; i++) {
        applyRateLimit(makeRequest(), RateLimitTier.HIGH_COST);
      }

      const { blocked } = applyRateLimit(makeRequest(), RateLimitTier.HIGH_COST);
      expect(blocked!.headers.get('Retry-After')).toBeTruthy();
    });

    it('includes X-RateLimit-* headers in 429 response', async () => {
      const limit = 5;

      for (let i = 0; i < limit; i++) {
        applyRateLimit(makeRequest(), RateLimitTier.HIGH_COST);
      }

      const { blocked } = applyRateLimit(makeRequest(), RateLimitTier.HIGH_COST);
      expect(blocked!.headers.get('X-RateLimit-Limit')).toBe(String(limit));
      expect(blocked!.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(blocked!.headers.get('X-RateLimit-Reset')).toBeTruthy();
    });

    it('returns error body with rate_limit type', async () => {
      const limit = 5;
      for (let i = 0; i < limit; i++) {
        applyRateLimit(makeRequest(), RateLimitTier.HIGH_COST);
      }

      const { blocked } = applyRateLimit(makeRequest(), RateLimitTier.HIGH_COST);
      const body = await parseBody(blocked!);
      expect(body.success).toBe(false);
      expect(body.error.type).toBe('rate_limit');
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('tracks different IPs independently', () => {
      const limit = 5;
      for (let i = 0; i < limit; i++) {
        applyRateLimit(makeRequest({ ip: '1.1.1.1' }), RateLimitTier.HIGH_COST);
      }

      const { blocked } = applyRateLimit(makeRequest({ ip: '2.2.2.2' }), RateLimitTier.HIGH_COST);
      expect(blocked).toBeNull();
    });

    it('uses rightmost X-Forwarded-For IP for rate limiting', () => {
      const limit = 5;
      // With depth=1, the last IP (192.168.1.1) is used as the trusted IP
      const headers = { 'x-forwarded-for': '10.0.0.1, 192.168.1.1' };

      for (let i = 0; i < limit; i++) {
        applyRateLimit(makeRequest({ ip: undefined, headers }), RateLimitTier.HIGH_COST);
      }

      // Same rightmost IP should be blocked
      const { blocked } = applyRateLimit(makeRequest({ ip: undefined, headers }), RateLimitTier.HIGH_COST);
      expect(blocked?.status).toBe(429);

      // Different rightmost IP should be allowed
      const { blocked: blocked2 } = applyRateLimit(
        makeRequest({ ip: undefined, headers: { 'x-forwarded-for': '99.0.0.1' } }),
        RateLimitTier.HIGH_COST
      );
      expect(blocked2).toBeNull();
    });
  });

  describe('body size exceeded (413)', () => {
    it('returns 413 when Content-Length exceeds tier limit', async () => {
      const req = makeRequest({
        method: 'POST',
        headers: { 'content-length': String(3 * 1024 * 1024) },
      });

      const { blocked } = applyRateLimit(req, RateLimitTier.HIGH_COST);
      expect(blocked).not.toBeNull();
      expect(blocked!.status).toBe(413);
    });

    it('returns blocked=null when Content-Length is within tier limit', () => {
      const req = makeRequest({
        method: 'POST',
        headers: { 'content-length': String(1 * 1024 * 1024) },
      });

      const { blocked } = applyRateLimit(req, RateLimitTier.HIGH_COST);
      expect(blocked).toBeNull();
    });

    it('returns blocked=null when Content-Length header is absent', () => {
      const req = makeRequest({ method: 'POST' });
      const { blocked } = applyRateLimit(req, RateLimitTier.HIGH_COST);
      expect(blocked).toBeNull();
    });

    it('returns error body with PAYLOAD_TOO_LARGE code', async () => {
      const req = makeRequest({
        method: 'POST',
        headers: { 'content-length': String(3 * 1024 * 1024) },
      });

      const { blocked } = applyRateLimit(req, RateLimitTier.HIGH_COST);
      const body = await parseBody(blocked!);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('enforces CONFIG tier body limit (64 KB)', async () => {
      const req = makeRequest({
        method: 'PUT',
        headers: { 'content-length': String(128 * 1024) },
      });

      const { blocked } = applyRateLimit(req, RateLimitTier.CONFIG);
      expect(blocked?.status).toBe(413);
    });
  });
});
