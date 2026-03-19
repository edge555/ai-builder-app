/**
 * @module rate-limiter
 * @description Sliding window rate limiter with in-memory and Redis backends.
 *
 * Tracks request counts per key (e.g. IP address) within a rolling time window.
 * When REDIS_URL is configured, uses Redis for multi-process safe rate limiting.
 * Falls back to in-memory when Redis is unavailable.
 *
 * Usage:
 *   const limiter = getRateLimiter();
 *   const result = await limiter.check('192.168.1.1', 5, 60_000);
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

/** Common interface for both in-memory and Redis rate limiters. */
export interface IRateLimiter {
  check(key: string, limit: number, windowMs: number): RateLimitResult | Promise<RateLimitResult>;
  cleanup(maxWindowMs?: number): void;
  destroy(): void;
  readonly size: number;
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
let instance: IRateLimiter | null = null;

/**
 * Returns the rate limiter singleton.
 * When REDIS_URL is set, creates a Redis-backed limiter on first call.
 * Falls back to in-memory if Redis is unavailable or not configured.
 */
export function getRateLimiter(): IRateLimiter {
  if (!instance) {
    // Lazy import config to avoid circular dependency at module load time
    const { config } = require('../config');

    if (config.redis?.url) {
      try {
        const { RedisRateLimiter } = require('./redis-rate-limiter');
        instance = new RedisRateLimiter(config.redis.url);
        const { createLogger } = require('../logger');
        createLogger('security/rate-limiter').info('Using Redis-backed rate limiter');
      } catch (err) {
        const { createLogger } = require('../logger');
        createLogger('security/rate-limiter').warn(
          'Failed to initialize Redis rate limiter — falling back to in-memory',
          { error: err instanceof Error ? err.message : String(err) }
        );
        instance = new RateLimiter();
      }
    } else {
      instance = new RateLimiter();
    }
  }
  return instance;
}

/** Replace the singleton (for testing). */
export function setRateLimiter(limiter: IRateLimiter | null): void {
  instance = limiter;
}
