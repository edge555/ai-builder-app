/**
 * @module guard
 * @description Rate-limit guard called at the top of each route handler.
 *
 * Combines IP-based rate limiting and request body size enforcement into a
 * single `applyRateLimit()` call. Returns rate limit headers on every request
 * and a blocked `Response` when the request should be rejected (429 / 413).
 *
 * IP extraction flow:
 *   1. Prefer `request.ip` (set by the deployment platform, e.g. Vercel)
 *   2. Fall back to X-Forwarded-For using the rightmost-trusted IP pattern
 *      (controlled by TRUSTED_PROXY_DEPTH config)
 *   3. Fall back to 'unknown' for local dev
 */

import { NextRequest } from 'next/server';
import { config } from '../config';
import { AppError } from '../api/error';
import { getCorsHeaders } from '../api/utils';
import { createLogger } from '../logger';
import { getRateLimiter } from './rate-limiter';
import { RateLimitTier, getTierConfig } from './rate-limit-config';

const logger = createLogger('security/guard');

// Matches valid IPv4, IPv6, and IPv4-mapped IPv6 addresses
const IP_FORMAT = /^[\d.:a-fA-F]+$/;

/**
 * Extract client IP from the request.
 *
 * Prefers platform-provided `request.ip` (Vercel, Cloudflare, etc.), then
 * falls back to X-Forwarded-For using the rightmost-trusted IP pattern to
 * prevent spoofing. The depth is controlled by `TRUSTED_PROXY_DEPTH`:
 *   depth=1 → use the last IP (set by your reverse proxy)
 *   depth=2 → use the second-to-last IP (proxy behind a CDN)
 *   depth=0 → skip XFF entirely, only use request.ip
 */
export function getClientIp(request: NextRequest): string {
  // 1. Prefer platform-provided IP (not spoofable)
  if (request.ip) {
    return request.ip;
  }

  // 2. Fall back to X-Forwarded-For with rightmost-trusted IP
  const depth = config.security.trustedProxyDepth;
  const forwarded = request.headers.get('x-forwarded-for');

  if (forwarded && depth > 0) {
    const ips = forwarded.split(',').map(ip => ip.trim());
    // Use rightmost-trusted: the IP at position (length - depth)
    // If depth exceeds the list, use the first (leftmost) IP
    const index = Math.max(0, ips.length - depth);
    const trustedIp = ips[index];
    if (trustedIp && IP_FORMAT.test(trustedIp)) {
      return trustedIp;
    }
  }

  return 'unknown';
}

export interface RateLimitGuardResult {
  /** Non-null when the request should be blocked (429 or 413). */
  blocked: Response | null;
  /** Rate limit headers to include on every response. Empty when rate limiting is disabled. */
  headers: Record<string, string>;
}

/**
 * Apply rate limiting and body size checks to an incoming request.
 *
 * @returns Rate limit headers (always) and a blocked Response (when rejected).
 */
export async function applyRateLimit(
  request: NextRequest,
  tier: RateLimitTier
): Promise<RateLimitGuardResult> {
  // Skip entirely when rate limiting is disabled
  if (!config.rateLimit.enabled) {
    return { blocked: null, headers: {} };
  }

  const tierCfg = getTierConfig(tier);

  // --- Body size check (only for requests that carry a body) ---
  const method = request.method.toUpperCase();
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const bytes = parseInt(contentLength, 10);
      if (!Number.isNaN(bytes) && bytes > tierCfg.maxBodyBytes) {
        logger.warn('Request body too large', {
          ip: getClientIp(request),
          tier,
          contentLength: bytes,
          maxBytes: tierCfg.maxBodyBytes,
        });

        return {
          blocked: new Response(
            JSON.stringify({
              success: false,
              error: {
                type: 'api',
                code: 'PAYLOAD_TOO_LARGE',
                message: `Request body exceeds the ${tierCfg.maxBodyBytes} byte limit`,
                recoverable: false,
              },
            }),
            {
              status: 413,
              headers: {
                ...getCorsHeaders(request),
                'Content-Type': 'application/json',
              },
            }
          ),
          headers: {},
        };
      }
    }
  }

  // --- Rate limit check ---
  const ip = getClientIp(request);
  const key = `${tier}:${ip}`;
  const limiter = getRateLimiter();
  const result = await limiter.check(key, tierCfg.maxRequests, tierCfg.windowMs);

  const rateLimitHeaders: Record<string, string> = {
    'X-RateLimit-Limit': String(tierCfg.maxRequests),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };

  if (!result.allowed) {
    const retryAfterSec = Math.ceil((result.resetAt - Date.now()) / 1000);
    logger.warn('Rate limit exceeded', { ip, tier, retryAfterSec });

    const appError = AppError.rateLimit(
      `Rate limit exceeded. Try again in ${retryAfterSec} seconds.`,
      { tier, retryAfterSec }
    );

    return {
      blocked: new Response(JSON.stringify({ success: false, error: appError.toApiError() }), {
        status: 429,
        headers: {
          ...getCorsHeaders(request),
          ...rateLimitHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfterSec),
        },
      }),
      headers: rateLimitHeaders,
    };
  }

  return { blocked: null, headers: rateLimitHeaders };
}
