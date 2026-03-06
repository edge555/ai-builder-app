import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter } from '../rate-limiter';

// Use fake timers so we can control Date.now() and intervals
vi.useFakeTimers();

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    // Pass a very long cleanup interval so it doesn't fire during tests
    limiter = new RateLimiter(999_999_999);
  });

  afterEach(() => {
    limiter.destroy();
    vi.clearAllTimers();
  });

  describe('check()', () => {
    it('allows the first request and returns correct remaining count', () => {
      const result = limiter.check('ip:1.2.3.4', 5, 60_000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.resetAt).toBeGreaterThan(Date.now());
    });

    it('counts requests within the window', () => {
      limiter.check('ip:1.2.3.4', 5, 60_000);
      limiter.check('ip:1.2.3.4', 5, 60_000);
      const result = limiter.check('ip:1.2.3.4', 5, 60_000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('blocks the request when the limit is reached', () => {
      for (let i = 0; i < 5; i++) {
        limiter.check('ip:1.2.3.4', 5, 60_000);
      }
      const result = limiter.check('ip:1.2.3.4', 5, 60_000);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('resets the counter after the window expires', () => {
      for (let i = 0; i < 5; i++) {
        limiter.check('ip:1.2.3.4', 5, 60_000);
      }
      expect(limiter.check('ip:1.2.3.4', 5, 60_000).allowed).toBe(false);

      // Advance time past the window
      vi.advanceTimersByTime(61_000);

      const result = limiter.check('ip:1.2.3.4', 5, 60_000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('tracks multiple keys independently', () => {
      for (let i = 0; i < 5; i++) {
        limiter.check('ip:1.2.3.4', 5, 60_000);
      }

      // Different IP should be unaffected
      const result = limiter.check('ip:9.9.9.9', 5, 60_000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('tracks different tiers for the same IP independently', () => {
      for (let i = 0; i < 5; i++) {
        limiter.check('HIGH_COST:1.2.3.4', 5, 60_000);
      }
      // HIGH_COST exhausted, but LOW_COST is separate
      const result = limiter.check('LOW_COST:1.2.3.4', 60, 60_000);
      expect(result.allowed).toBe(true);
    });

    it('returns the correct resetAt timestamp', () => {
      const now = Date.now();
      const windowMs = 60_000;
      const result = limiter.check('ip:1.2.3.4', 5, windowMs);

      expect(result.resetAt).toBeGreaterThanOrEqual(now + windowMs - 10);
      expect(result.resetAt).toBeLessThanOrEqual(now + windowMs + 10);
    });
  });

  describe('cleanup()', () => {
    it('evicts entries whose window has fully expired', () => {
      limiter.check('ip:old', 5, 60_000);
      limiter.check('ip:new', 5, 60_000);

      expect(limiter.size).toBe(2);

      // Advance beyond the default cleanup cutoff (120s)
      vi.advanceTimersByTime(121_000);
      limiter.cleanup();

      expect(limiter.size).toBe(0);
    });

    it('keeps entries whose window has not yet expired', () => {
      limiter.check('ip:active', 5, 60_000);

      vi.advanceTimersByTime(30_000); // only halfway through
      limiter.cleanup(120_000);

      expect(limiter.size).toBe(1);
    });
  });

  describe('destroy()', () => {
    it('clears the store', () => {
      limiter.check('ip:1.2.3.4', 5, 60_000);
      expect(limiter.size).toBe(1);

      limiter.destroy();
      expect(limiter.size).toBe(0);
    });

    it('is safe to call multiple times', () => {
      expect(() => {
        limiter.destroy();
        limiter.destroy();
      }).not.toThrow();
    });
  });
});
