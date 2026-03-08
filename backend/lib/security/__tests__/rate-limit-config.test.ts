import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTierConfig, RateLimitTier } from '../rate-limit-config';

// Mock config module
vi.mock('../../config', () => ({
  config: {
    rateLimit: {
      highCostMax: 10,
      mediumCostMax: 50,
      lowCostMax: 200,
      configMax: 100,
      windowMs: 60000,
    },
  },
}));

// Mock constants module
vi.mock('../../constants', () => ({
  MAX_BODY_HIGH_COST_BYTES: 10485760, // 10MB
  MAX_BODY_MEDIUM_COST_BYTES: 5242880, // 5MB
  MAX_BODY_LOW_COST_BYTES: 1048576, // 1MB
  MAX_BODY_CONFIG_BYTES: 524288, // 512KB
}));

describe('getTierConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('HIGH_COST tier', () => {
    it('should return correct config for HIGH_COST tier', () => {
      const config = getTierConfig(RateLimitTier.HIGH_COST);

      expect(config).toEqual({
        maxRequests: 10,
        windowMs: 60000,
        maxBodyBytes: 10485760,
      });
    });

    it('should have lowest maxRequests for HIGH_COST tier', () => {
      const highCostConfig = getTierConfig(RateLimitTier.HIGH_COST);
      const mediumCostConfig = getTierConfig(RateLimitTier.MEDIUM_COST);
      const lowCostConfig = getTierConfig(RateLimitTier.LOW_COST);

      expect(highCostConfig.maxRequests).toBeLessThan(mediumCostConfig.maxRequests);
      expect(highCostConfig.maxRequests).toBeLessThan(lowCostConfig.maxRequests);
    });

    it('should have highest maxBodyBytes for HIGH_COST tier', () => {
      const highCostConfig = getTierConfig(RateLimitTier.HIGH_COST);
      const mediumCostConfig = getTierConfig(RateLimitTier.MEDIUM_COST);
      const lowCostConfig = getTierConfig(RateLimitTier.LOW_COST);

      expect(highCostConfig.maxBodyBytes).toBeGreaterThan(mediumCostConfig.maxBodyBytes);
      expect(highCostConfig.maxBodyBytes).toBeGreaterThan(lowCostConfig.maxBodyBytes);
    });
  });

  describe('MEDIUM_COST tier', () => {
    it('should return correct config for MEDIUM_COST tier', () => {
      const config = getTierConfig(RateLimitTier.MEDIUM_COST);

      expect(config).toEqual({
        maxRequests: 50,
        windowMs: 60000,
        maxBodyBytes: 5242880,
      });
    });

    it('should have moderate maxRequests between HIGH_COST and LOW_COST', () => {
      const highCostConfig = getTierConfig(RateLimitTier.HIGH_COST);
      const mediumCostConfig = getTierConfig(RateLimitTier.MEDIUM_COST);
      const lowCostConfig = getTierConfig(RateLimitTier.LOW_COST);

      expect(mediumCostConfig.maxRequests).toBeGreaterThan(highCostConfig.maxRequests);
      expect(mediumCostConfig.maxRequests).toBeLessThan(lowCostConfig.maxRequests);
    });

    it('should have moderate maxBodyBytes between HIGH_COST and LOW_COST', () => {
      const highCostConfig = getTierConfig(RateLimitTier.HIGH_COST);
      const mediumCostConfig = getTierConfig(RateLimitTier.MEDIUM_COST);
      const lowCostConfig = getTierConfig(RateLimitTier.LOW_COST);

      expect(mediumCostConfig.maxBodyBytes).toBeLessThan(highCostConfig.maxBodyBytes);
      expect(mediumCostConfig.maxBodyBytes).toBeGreaterThan(lowCostConfig.maxBodyBytes);
    });
  });

  describe('LOW_COST tier', () => {
    it('should return correct config for LOW_COST tier', () => {
      const config = getTierConfig(RateLimitTier.LOW_COST);

      expect(config).toEqual({
        maxRequests: 200,
        windowMs: 60000,
        maxBodyBytes: 1048576,
      });
    });

    it('should have highest maxRequests for LOW_COST tier', () => {
      const highCostConfig = getTierConfig(RateLimitTier.HIGH_COST);
      const mediumCostConfig = getTierConfig(RateLimitTier.MEDIUM_COST);
      const lowCostConfig = getTierConfig(RateLimitTier.LOW_COST);

      expect(lowCostConfig.maxRequests).toBeGreaterThan(highCostConfig.maxRequests);
      expect(lowCostConfig.maxRequests).toBeGreaterThan(mediumCostConfig.maxRequests);
    });

    it('should have lowest maxBodyBytes for LOW_COST tier', () => {
      const highCostConfig = getTierConfig(RateLimitTier.HIGH_COST);
      const mediumCostConfig = getTierConfig(RateLimitTier.MEDIUM_COST);
      const lowCostConfig = getTierConfig(RateLimitTier.LOW_COST);

      expect(lowCostConfig.maxBodyBytes).toBeLessThan(highCostConfig.maxBodyBytes);
      expect(lowCostConfig.maxBodyBytes).toBeLessThan(mediumCostConfig.maxBodyBytes);
    });
  });

  describe('CONFIG tier', () => {
    it('should return correct config for CONFIG tier', () => {
      const config = getTierConfig(RateLimitTier.CONFIG);

      expect(config).toEqual({
        maxRequests: 100,
        windowMs: 60000,
        maxBodyBytes: 524288,
      });
    });

    it('should have moderate maxRequests between HIGH_COST and LOW_COST', () => {
      const highCostConfig = getTierConfig(RateLimitTier.HIGH_COST);
      const configTier = getTierConfig(RateLimitTier.CONFIG);
      const lowCostConfig = getTierConfig(RateLimitTier.LOW_COST);

      expect(configTier.maxRequests).toBeGreaterThan(highCostConfig.maxRequests);
      expect(configTier.maxRequests).toBeLessThan(lowCostConfig.maxRequests);
    });

    it('should have lowest maxBodyBytes for CONFIG tier', () => {
      const highCostConfig = getTierConfig(RateLimitTier.HIGH_COST);
      const mediumCostConfig = getTierConfig(RateLimitTier.MEDIUM_COST);
      const lowCostConfig = getTierConfig(RateLimitTier.LOW_COST);
      const configTier = getTierConfig(RateLimitTier.CONFIG);

      expect(configTier.maxBodyBytes).toBeLessThan(highCostConfig.maxBodyBytes);
      expect(configTier.maxBodyBytes).toBeLessThan(mediumCostConfig.maxBodyBytes);
      expect(configTier.maxBodyBytes).toBeLessThan(lowCostConfig.maxBodyBytes);
    });
  });

  describe('return value shape', () => {
    it('should return object with maxRequests, windowMs, and maxBodyBytes', () => {
      const config = getTierConfig(RateLimitTier.HIGH_COST);

      expect(config).toHaveProperty('maxRequests');
      expect(config).toHaveProperty('windowMs');
      expect(config).toHaveProperty('maxBodyBytes');
    });

    it('should return numeric values for all properties', () => {
      const configs = [
        getTierConfig(RateLimitTier.HIGH_COST),
        getTierConfig(RateLimitTier.MEDIUM_COST),
        getTierConfig(RateLimitTier.LOW_COST),
        getTierConfig(RateLimitTier.CONFIG),
      ];

      for (const config of configs) {
        expect(typeof config.maxRequests).toBe('number');
        expect(typeof config.windowMs).toBe('number');
        expect(typeof config.maxBodyBytes).toBe('number');
      }
    });

    it('should return positive values for all properties', () => {
      const configs = [
        getTierConfig(RateLimitTier.HIGH_COST),
        getTierConfig(RateLimitTier.MEDIUM_COST),
        getTierConfig(RateLimitTier.LOW_COST),
        getTierConfig(RateLimitTier.CONFIG),
      ];

      for (const config of configs) {
        expect(config.maxRequests).toBeGreaterThan(0);
        expect(config.windowMs).toBeGreaterThan(0);
        expect(config.maxBodyBytes).toBeGreaterThan(0);
      }
    });
  });

  describe('edge cases', () => {
    it('should have same windowMs across all tiers', () => {
      const highCostConfig = getTierConfig(RateLimitTier.HIGH_COST);
      const mediumCostConfig = getTierConfig(RateLimitTier.MEDIUM_COST);
      const lowCostConfig = getTierConfig(RateLimitTier.LOW_COST);
      const configTier = getTierConfig(RateLimitTier.CONFIG);

      expect(highCostConfig.windowMs).toBe(mediumCostConfig.windowMs);
      expect(mediumCostConfig.windowMs).toBe(lowCostConfig.windowMs);
      expect(lowCostConfig.windowMs).toBe(configTier.windowMs);
    });
  });

  describe('side effects', () => {
    it('should not have side effects on input', () => {
      const tier = RateLimitTier.HIGH_COST;
      const tierCopy = tier;

      getTierConfig(tier);

      expect(tier).toBe(tierCopy);
    });
  });
});
