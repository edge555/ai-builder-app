/**
 * @module rate-limiter
 * @description In-memory sliding window rate limiter.
 *
 * Tracks request counts per key (e.g. IP address) within a rolling time window.
 * Designed with a simple interface so it can later be swapped for a Redis-backed
 * implementation without touching call sites.
 *
 * Usage:
 *   const limiter = getRateLimiter();
 *   const result = limiter.check('192.168.1.1', 5, 60_000);
 *   if (!result.allowed) { // return 429 }
 */

import { RATE_LIMIT_CLEANUP_INTERVAL_MS, RATE_LIMIT_MAX_STORE_SIZE } from '../constants';

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Requests remaining in the current window */
  remaining: number;
  /** Unix timestamp (ms) when the window resets */
  resetAt: number;
}

interface WindowEntry {
  count: number;
  windowStart: number;
}

export class RateLimiter {
  private readonly store = new Map<string, WindowEntry>();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly maxStoreSize: number;

  constructor(cleanupIntervalMs = RATE_LIMIT_CLEANUP_INTERVAL_MS, maxStoreSize = RATE_LIMIT_MAX_STORE_SIZE) {
    this.maxStoreSize = maxStoreSize;
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs);
    // Allow the process to exit even if the interval is still running
    this.cleanupTimer.unref?.();
  }

  /**
   * Check and increment the counter for the given key.
   * Returns whether the request is allowed and how many remain.
   */
  check(key: string, limit: number, windowMs: number): RateLimitResult {
    // Prevent unbounded memory growth under attack (many unique IPs)
    if (this.store.size >= this.maxStoreSize) {
      this.cleanup();
    }

    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now - entry.windowStart >= windowMs) {
      // Start a new window
      this.store.set(key, { count: 1, windowStart: now });
      return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
    }

    const resetAt = entry.windowStart + windowMs;

    if (entry.count >= limit) {
      return { allowed: false, remaining: 0, resetAt };
    }

    entry.count += 1;
    return { allowed: true, remaining: limit - entry.count, resetAt };
  }

  /**
   * Evict entries whose window has fully expired.
   * Called automatically on the cleanup interval.
   */
  cleanup(maxWindowMs = 120_000): void {
    const cutoff = Date.now() - maxWindowMs;
    for (const [key, entry] of this.store) {
      if (entry.windowStart < cutoff) {
        this.store.delete(key);
      }
    }
  }

  /** Stop the cleanup interval (use in tests / graceful shutdown). */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.store.clear();
  }

  /** Number of tracked keys (useful for tests). */
  get size(): number {
    return this.store.size;
  }
}

// Singleton — shared across all route handlers in the same Node.js process.
let instance: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!instance) {
    instance = new RateLimiter();
  }
  return instance;
}

/** Replace the singleton (for testing). */
export function setRateLimiter(limiter: RateLimiter | null): void {
  instance = limiter;
}
