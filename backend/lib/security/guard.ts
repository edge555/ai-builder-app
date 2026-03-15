/**
 * @module guard
 * @description Rate-limit guard called at the top of each route handler.
 *
 * Combines IP-based rate limiting and request body size enforcement into a
 * single `applyRateLimit()` call. Returns `null` when the request is allowed
 * (the route continues), or a ready-made `Response` (429 / 413) when blocked.
 */

import { NextRequest } from 'next/server';
import { config } from '../config';
import { AppError } from '../api/error';
import { getCorsHeaders } from '../api/utils';
import { createLogger } from '../logger';
import { getRateLimiter } from './rate-limiter';
import { RateLimitTier, getTierConfig } from './rate-limit-config';

const logger = createLogger('security/guard');

/**
 * Extract client IP from the request.
 * Checks X-Forwarded-For first (proxy / load-balancer), then falls back to
 * Next.js `request.ip`, and finally to 'unknown' for local dev.
 */
// Matches valid IPv4, IPv6, and IPv4-mapped IPv6 addresses
const IP_FORMAT = /^[\d.:a-fA-F]+$/;

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // X-Forwarded-For may contain a comma-separated list; use the first (client) IP.
    const firstIp = forwarded.split(',')[0].trim();
    // Validate format to prevent crafted header values from being used as rate limit keys
    if (IP_FORMAT.test(firstIp)) {
      return firstIp;
    }
    // Fall back if the extracted value doesn't look like an IP
  }
  return request.ip ?? 'unknown';
}

/**
 * Apply rate limiting and body size checks to an incoming request.
 *
 * @returns `null` if the request is allowed, or a `Response` to return immediately (429 / 413).
 */
export function applyRateLimit(
  request: NextRequest,
  tier: RateLimitTier
): Response | null {
  // Skip entirely when rate limiting is disabled
  if (!config.rateLimit.enabled) {
    return null;
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

        return new Response(
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
        );
      }
    }
  }

  // --- Rate limit check ---
  const ip = getClientIp(request);
  const key = `${tier}:${ip}`;
  const limiter = getRateLimiter();
  const result = limiter.check(key, tierCfg.maxRequests, tierCfg.windowMs);

  if (!result.allowed) {
    const retryAfterSec = Math.ceil((result.resetAt - Date.now()) / 1000);
    logger.warn('Rate limit exceeded', { ip, tier, retryAfterSec });

    const appError = AppError.rateLimit(
      `Rate limit exceeded. Try again in ${retryAfterSec} seconds.`,
      { tier, retryAfterSec }
    );

    return new Response(JSON.stringify({ success: false, error: appError.toApiError() }), {
      status: 429,
      headers: {
        ...getCorsHeaders(request),
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSec),
        'X-RateLimit-Limit': String(tierCfg.maxRequests),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
      },
    });
  }

  return null;
}
