/**
 * @module redis-rate-limiter
 * @description Redis-backed sliding window rate limiter.
 *
 * Implements the same RateLimitResult interface as the in-memory RateLimiter
 * so it can be used as a drop-in replacement. Uses a Lua script for atomic
 * check-and-increment to avoid race conditions.
 *
 * On any Redis error (connection, timeout, OOM), falls back transparently
 * to allowing the request and logs the failure.
 */

import Redis from 'ioredis';
import { createLogger } from '../logger';
import type { RateLimitResult } from './rate-limiter';

const logger = createLogger('security/redis-rate-limiter');

/**
 * Lua script for atomic sliding-window rate limiting.
 *
 * KEYS[1] = rate limit key (e.g., "rl:HIGH_COST:1.2.3.4")
 * ARGV[1] = limit (max requests)
 * ARGV[2] = windowMs (window size in milliseconds)
 * ARGV[3] = now (current timestamp in ms)
 *
 * Returns: [allowed (0|1), remaining, resetAt]
 */
const RATE_LIMIT_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local data = redis.call('GET', key)
if data then
  local parts = cjson.decode(data)
  local windowStart = tonumber(parts[1])
  local count = tonumber(parts[2])

  if now - windowStart >= windowMs then
    -- Window expired, start fresh
    redis.call('SET', key, cjson.encode({now, 1}))
    redis.call('PEXPIRE', key, windowMs)
    return {1, limit - 1, now + windowMs}
  end

  local resetAt = windowStart + windowMs

  if count >= limit then
    return {0, 0, resetAt}
  end

  parts[2] = count + 1
  redis.call('SET', key, cjson.encode(parts))
  redis.call('PEXPIRE', key, resetAt - now)
  return {1, limit - (count + 1), resetAt}
else
  -- No entry, start new window
  redis.call('SET', key, cjson.encode({now, 1}))
  redis.call('PEXPIRE', key, windowMs)
  return {1, limit - 1, now + windowMs}
end
`;

export class RedisRateLimiter {
  private readonly redis: Redis;
  private readonly keyPrefix: string;
  private fallbackActive = false;

  constructor(redisUrl: string, keyPrefix = 'rl:') {
    this.keyPrefix = keyPrefix;
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        // Retry with exponential backoff, cap at 3s, give up after 5 attempts
        if (times > 5) return null;
        return Math.min(times * 200, 3000);
      },
      enableOfflineQueue: false,
      connectTimeout: 5000,
      commandTimeout: 2000,
    });

    this.redis.on('error', (err) => {
      if (!this.fallbackActive) {
        this.fallbackActive = true;
        logger.warn('Redis rate limiter connection error — requests will be allowed', {
          error: err.message,
        });
      }
    });

    this.redis.on('ready', () => {
      if (this.fallbackActive) {
        this.fallbackActive = false;
        logger.info('Redis rate limiter reconnected');
      }
    });
  }

  /**
   * Check and increment the counter for the given key.
   * On Redis failure, returns an "allowed" result (fail-open).
   */
  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const redisKey = `${this.keyPrefix}${key}`;
    const now = Date.now();

    try {
      const result = await (this.redis as any).eval(
        RATE_LIMIT_LUA,
        1,
        redisKey,
        limit,
        windowMs,
        now
      ) as [number, number, number];

      this.fallbackActive = false;

      return {
        allowed: result[0] === 1,
        remaining: result[1],
        resetAt: result[2],
      };
    } catch (err) {
      // Fail-open: allow the request on Redis error
      if (!this.fallbackActive) {
        this.fallbackActive = true;
        logger.warn('Redis rate limiter error — allowing request', {
          error: err instanceof Error ? err.message : String(err),
          key,
        });
      }
      return {
        allowed: true,
        remaining: limit - 1,
        resetAt: now + windowMs,
      };
    }
  }

  /** No-op — Redis handles TTL-based expiration. */
  cleanup(): void {
    // Redis keys auto-expire via PEXPIRE in the Lua script
  }

  /** Disconnect from Redis and clean up. */
  destroy(): void {
    this.redis.disconnect();
  }

  /** Number of tracked keys (approximate, for diagnostics only). */
  get size(): number {
    // Not meaningful for Redis — return 0
    return 0;
  }
}
