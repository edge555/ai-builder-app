/**
 * Complex edge case tests for RateLimiter.
 *
 * The basic tests cover happy-path allowing, blocking, and window reset.
 * These tests focus on:
 *  - Exact boundary: the Nth request at the limit (allowed) vs N+1 (blocked)
 *  - Window expiry timing: request at exactly windowMs fires a new window
 *  - Max store size pressure: eviction happens before the check, not after
 *  - remaining count accuracy across the window lifetime
 *  - destroy() prevents further state accumulation
 *  - Key isolation: two IPs share nothing even with the same window
 *  - Cleanup evicts only entries older than maxWindowMs, not recent ones
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter } from '../rate-limiter';

describe('RateLimiter — complex boundary and invariant tests', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    // Large cleanup interval so automatic cleanup doesn't interfere with our tests
    limiter = new RateLimiter(60_000_000);
  });

  afterEach(() => {
    limiter.destroy();
    vi.useRealTimers();
  });

  // ── Exact limit boundary ───────────────────────────────────────────────────

  describe('exact limit boundary (limit = N means N requests allowed, N+1 blocked)', () => {
    it('limit=1: first request allowed, second blocked', () => {
      const r1 = limiter.check('ip', 1, 60_000);
      const r2 = limiter.check('ip', 1, 60_000);

      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(false);
    });

    it('limit=5: fifth request allowed, sixth blocked', () => {
      for (let i = 0; i < 5; i++) {
        const r = limiter.check('ip', 5, 60_000);
        expect(r.allowed).toBe(true);
      }
      const r6 = limiter.check('ip', 5, 60_000);
      expect(r6.allowed).toBe(false);
    });

    it('remaining decrements correctly from limit-1 down to 0', () => {
      const limit = 4;
      const results = Array.from({ length: limit }, () => limiter.check('ip', limit, 60_000));

      expect(results[0].remaining).toBe(3);
      expect(results[1].remaining).toBe(2);
      expect(results[2].remaining).toBe(1);
      expect(results[3].remaining).toBe(0);
    });

    it('remaining stays 0 for all requests after the limit is hit', () => {
      limiter.check('ip', 2, 60_000);
      limiter.check('ip', 2, 60_000);

      const r3 = limiter.check('ip', 2, 60_000);
      const r4 = limiter.check('ip', 2, 60_000);

      expect(r3.remaining).toBe(0);
      expect(r4.remaining).toBe(0);
    });
  });

  // ── Window expiry timing ───────────────────────────────────────────────────

  describe('window expiry — new window opens at exactly windowMs elapsed', () => {
    it('request at windowMs boundary starts a fresh window and is allowed', () => {
      const windowMs = 10_000;

      limiter.check('ip', 1, windowMs); // consume the one allowed request
      const blocked = limiter.check('ip', 1, windowMs);
      expect(blocked.allowed).toBe(false);

      vi.advanceTimersByTime(windowMs); // advance by exactly windowMs

      const fresh = limiter.check('ip', 1, windowMs);
      expect(fresh.allowed).toBe(true);
    });

    it('request just before window expiry is still blocked', () => {
      const windowMs = 10_000;

      limiter.check('ip', 1, windowMs); // consume limit
      vi.advanceTimersByTime(windowMs - 1); // 1ms before expiry

      const r = limiter.check('ip', 1, windowMs);
      expect(r.allowed).toBe(false);
    });

    it('after window expires, remaining resets to limit-1 (first of new window)', () => {
      limiter.check('ip', 3, 10_000);
      limiter.check('ip', 3, 10_000); // remaining: 1

      vi.advanceTimersByTime(10_000);

      const r = limiter.check('ip', 3, 10_000);
      expect(r.remaining).toBe(2); // fresh window: 3-1
    });

    it('resetAt is set to windowStart + windowMs for a new window', () => {
      const windowMs = 5_000;
      const before = Date.now();

      const r = limiter.check('ip', 5, windowMs);

      expect(r.resetAt).toBeGreaterThanOrEqual(before + windowMs);
      expect(r.resetAt).toBeLessThanOrEqual(Date.now() + windowMs);
    });

    it('resetAt does not change within the same window', () => {
      const r1 = limiter.check('ip', 5, 10_000);
      vi.advanceTimersByTime(2_000);
      const r2 = limiter.check('ip', 5, 10_000);

      expect(r2.resetAt).toBe(r1.resetAt);
    });
  });

  // ── Key isolation ──────────────────────────────────────────────────────────

  describe('key isolation — different IPs share no state', () => {
    it('two IPs with limit=1 each get one allowed request independently', () => {
      const a1 = limiter.check('ip-a', 1, 60_000);
      const b1 = limiter.check('ip-b', 1, 60_000);

      expect(a1.allowed).toBe(true);
      expect(b1.allowed).toBe(true);
    });

    it('exhausting one IP does not affect another IP', () => {
      limiter.check('victim', 2, 60_000);
      limiter.check('victim', 2, 60_000); // exhausted

      const other = limiter.check('bystander', 2, 60_000);
      expect(other.allowed).toBe(true);
    });

    it('each key tracks its own window start independently', () => {
      limiter.check('early', 1, 10_000); // window starts at T=0

      vi.advanceTimersByTime(5_000); // T=5000

      limiter.check('late', 1, 10_000); // window starts at T=5000

      vi.advanceTimersByTime(5_000); // T=10000 — 'early' window expired, 'late' still open

      const earlyRefreshed = limiter.check('early', 1, 10_000);
      const lateStillBlocked = limiter.check('late', 1, 10_000);

      expect(earlyRefreshed.allowed).toBe(true);
      expect(lateStillBlocked.allowed).toBe(false);
    });
  });

  // ── Max store size pressure ────────────────────────────────────────────────

  describe('max store size — eviction triggered before accepting new keys', () => {
    it('when store is full, cleanup() is called and new key is admitted', () => {
      // Create a limiter with maxStoreSize = 5 and very long cleanup interval
      const small = new RateLimiter(60_000_000, 5);

      try {
        // Fill it to capacity with fresh entries (within window)
        for (let i = 0; i < 5; i++) {
          small.check(`ip${i}`, 10, 60_000);
        }
        expect(small.size).toBe(5);

        // Expire those entries by advancing time past the default cleanup window
        vi.advanceTimersByTime(120_001);

        // Now adding a 6th key should trigger cleanup (evicting expired entries)
        // and still be allowed
        const r = small.check('new-ip', 10, 60_000);
        expect(r.allowed).toBe(true);
        // After cleanup evicted old entries, size should be 1 (only the new key)
        expect(small.size).toBe(1);
      } finally {
        small.destroy();
      }
    });

    it('when store is at capacity with fresh entries, new key is still admitted', () => {
      // All entries are within their window so cleanup does NOT evict them.
      // The new key should still be admitted — the guard can't refuse a request.
      const small = new RateLimiter(60_000_000, 3);

      try {
        small.check('a', 10, 60_000);
        small.check('b', 10, 60_000);
        small.check('c', 10, 60_000);
        expect(small.size).toBe(3);

        // Store is full; cleanup evicts nothing (all fresh); new key gets added anyway
        const r = small.check('d', 10, 60_000);
        expect(r.allowed).toBe(true);
      } finally {
        small.destroy();
      }
    });
  });

  // ── Manual cleanup() ──────────────────────────────────────────────────────

  describe('cleanup() — evicts only expired entries', () => {
    it('cleanup with default maxWindowMs evicts entries older than 120s', () => {
      limiter.check('old', 5, 60_000);
      vi.advanceTimersByTime(120_001); // older than default 120s
      limiter.check('fresh', 5, 60_000);

      expect(limiter.size).toBe(2);
      limiter.cleanup(); // should evict 'old', keep 'fresh'
      expect(limiter.size).toBe(1);
    });

    it('cleanup with custom maxWindowMs only evicts entries beyond that window', () => {
      limiter.check('ip1', 5, 60_000);
      vi.advanceTimersByTime(30_000); // 30s
      limiter.check('ip2', 5, 60_000);

      limiter.cleanup(20_000); // evict only entries older than 20s → ip1 evicted
      expect(limiter.size).toBe(1);
    });

    it('cleanup called on empty store is a no-op', () => {
      expect(() => limiter.cleanup()).not.toThrow();
      expect(limiter.size).toBe(0);
    });

    it('cleanup does not affect entries within the window', () => {
      limiter.check('ip', 5, 60_000);
      vi.advanceTimersByTime(5_000); // well within window

      limiter.cleanup();

      expect(limiter.size).toBe(1);
    });
  });

  // ── destroy() ─────────────────────────────────────────────────────────────

  describe('destroy() — clears store and stops automatic cleanup timer', () => {
    it('size is 0 after destroy', () => {
      limiter.check('ip', 5, 60_000);
      limiter.destroy();

      expect(limiter.size).toBe(0);
    });

    it('check after destroy starts fresh (store was cleared)', () => {
      limiter.check('ip', 1, 60_000); // exhaust
      limiter.destroy();

      // Calling check again after destroy re-uses the same object;
      // since the store was cleared, the key is fresh
      const r = limiter.check('ip', 1, 60_000);
      expect(r.allowed).toBe(true);
    });

    it('calling destroy twice does not throw', () => {
      expect(() => {
        limiter.destroy();
        limiter.destroy();
      }).not.toThrow();
    });
  });

  // ── Rapid sequential requests (burst) ────────────────────────────────────

  describe('burst traffic — sequential requests in same tick', () => {
    it('100 requests against limit=50 — exactly 50 allowed, 50 blocked', () => {
      const results = Array.from({ length: 100 }, () => limiter.check('ip', 50, 60_000));
      const allowed = results.filter(r => r.allowed).length;
      const blocked = results.filter(r => !r.allowed).length;

      expect(allowed).toBe(50);
      expect(blocked).toBe(50);
    });

    it('all allowed requests have decreasing remaining counts', () => {
      const allowed = Array.from({ length: 5 }, () => limiter.check('ip', 5, 60_000));
      const remainingValues = allowed.map(r => r.remaining);

      expect(remainingValues).toEqual([4, 3, 2, 1, 0]);
    });

    it('different keys in burst all get their own fresh windows', () => {
      const results = Array.from({ length: 10 }, (_, i) =>
        limiter.check(`ip${i}`, 1, 60_000)
      );

      expect(results.every(r => r.allowed)).toBe(true);
      expect(limiter.size).toBe(10);
    });
  });
});
