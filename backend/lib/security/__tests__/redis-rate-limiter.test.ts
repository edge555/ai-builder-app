import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ioredis before importing the module
const mockRedisInstance = {
  eval: vi.fn(),
  disconnect: vi.fn(),
  on: vi.fn(),
};

vi.mock('ioredis', () => {
  return {
    default: class MockRedis {
      eval = mockRedisInstance.eval;
      disconnect = mockRedisInstance.disconnect;
      on = mockRedisInstance.on;
      constructor() {}
    },
  };
});

vi.mock('../../logger', () => ({
  createLogger: () => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { RedisRateLimiter } from '../redis-rate-limiter';

describe('RedisRateLimiter', () => {
  let limiter: RedisRateLimiter;

  beforeEach(() => {
    vi.clearAllMocks();
    limiter = new RedisRateLimiter('redis://localhost:6379');
  });

  describe('check()', () => {
    it('returns allowed=true when under limit', async () => {
      mockRedisInstance.eval.mockResolvedValue([1, 4, Date.now() + 60000]);

      const result = await limiter.check('HIGH_COST:1.2.3.4', 5, 60_000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.resetAt).toBeGreaterThan(Date.now());
    });

    it('returns allowed=false when limit exceeded', async () => {
      const resetAt = Date.now() + 60000;
      mockRedisInstance.eval.mockResolvedValue([0, 0, resetAt]);

      const result = await limiter.check('HIGH_COST:1.2.3.4', 5, 60_000);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.resetAt).toBe(resetAt);
    });

    it('passes correct arguments to Redis eval', async () => {
      mockRedisInstance.eval.mockResolvedValue([1, 4, Date.now() + 60000]);

      await limiter.check('HIGH_COST:1.2.3.4', 5, 60_000);

      expect(mockRedisInstance.eval).toHaveBeenCalledWith(
        expect.any(String), // Lua script
        1,                   // Number of keys
        'rl:HIGH_COST:1.2.3.4', // Key with prefix
        5,                   // Limit
        60_000,              // Window ms
        expect.any(Number),  // Current timestamp
      );
    });

    it('uses custom key prefix', async () => {
      vi.clearAllMocks();
      const customLimiter = new RedisRateLimiter('redis://localhost:6379', 'myapp:');
      mockRedisInstance.eval.mockResolvedValue([1, 4, Date.now() + 60000]);

      await customLimiter.check('test-key', 5, 60_000);

      expect(mockRedisInstance.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'myapp:test-key',
        5,
        60_000,
        expect.any(Number),
      );
    });

    it('fails open on Redis error — allows the request', async () => {
      mockRedisInstance.eval.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await limiter.check('HIGH_COST:1.2.3.4', 5, 60_000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('fails open on Redis timeout', async () => {
      mockRedisInstance.eval.mockRejectedValue(new Error('Command timed out'));

      const result = await limiter.check('HIGH_COST:1.2.3.4', 10, 60_000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it('fails open on Redis OOM', async () => {
      mockRedisInstance.eval.mockRejectedValue(new Error('OOM command not allowed'));

      const result = await limiter.check('HIGH_COST:1.2.3.4', 5, 60_000);

      expect(result.allowed).toBe(true);
    });
  });

  describe('cleanup()', () => {
    it('is a no-op (Redis handles TTL expiration)', () => {
      // Should not throw
      expect(() => limiter.cleanup()).not.toThrow();
    });
  });

  describe('destroy()', () => {
    it('disconnects from Redis', () => {
      limiter.destroy();
      expect(mockRedisInstance.disconnect).toHaveBeenCalled();
    });
  });

  describe('size', () => {
    it('returns 0 (not meaningful for Redis)', () => {
      expect(limiter.size).toBe(0);
    });
  });

  describe('connection events', () => {
    it('registers error and ready event handlers', () => {
      expect(mockRedisInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('ready', expect.any(Function));
    });
  });
});
