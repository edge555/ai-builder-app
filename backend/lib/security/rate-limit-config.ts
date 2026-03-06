/**
 * @module rate-limit-config
 * @description Tier definitions and per-tier limits for the rate limiter.
 *
 * Tiers are ordered by endpoint cost so the guard can apply the right limits
 * without hard-coding numbers at call sites.
 */

import { config } from '../config';
import {
  MAX_BODY_HIGH_COST_BYTES,
  MAX_BODY_MEDIUM_COST_BYTES,
  MAX_BODY_LOW_COST_BYTES,
  MAX_BODY_CONFIG_BYTES,
} from '../constants';

export enum RateLimitTier {
  /** Streaming AI generation endpoints — expensive API calls */
  HIGH_COST = 'HIGH_COST',
  /** Non-streaming AI endpoints */
  MEDIUM_COST = 'MEDIUM_COST',
  /** Cheap compute endpoints */
  LOW_COST = 'LOW_COST',
  /** Admin/config endpoints */
  CONFIG = 'CONFIG',
}

export interface TierConfig {
  maxRequests: number;
  windowMs: number;
  maxBodyBytes: number;
}

export function getTierConfig(tier: RateLimitTier): TierConfig {
  const { rateLimit } = config;

  switch (tier) {
    case RateLimitTier.HIGH_COST:
      return {
        maxRequests: rateLimit.highCostMax,
        windowMs: rateLimit.windowMs,
        maxBodyBytes: MAX_BODY_HIGH_COST_BYTES,
      };
    case RateLimitTier.MEDIUM_COST:
      return {
        maxRequests: rateLimit.mediumCostMax,
        windowMs: rateLimit.windowMs,
        maxBodyBytes: MAX_BODY_MEDIUM_COST_BYTES,
      };
    case RateLimitTier.LOW_COST:
      return {
        maxRequests: rateLimit.lowCostMax,
        windowMs: rateLimit.windowMs,
        maxBodyBytes: MAX_BODY_LOW_COST_BYTES,
      };
    case RateLimitTier.CONFIG:
      return {
        maxRequests: rateLimit.configMax,
        windowMs: rateLimit.windowMs,
        maxBodyBytes: MAX_BODY_CONFIG_BYTES,
      };
  }
}
