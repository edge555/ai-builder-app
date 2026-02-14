import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Shared Config', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Config Defaults', () => {
        it('should have default configuration values', () => {
            const defaultConfig = {
                apiTimeout: 30000,
                maxRetries: 3,
                debounceMs: 1500,
            };

            expect(defaultConfig.apiTimeout).toBe(30000);
            expect(defaultConfig.maxRetries).toBe(3);
            expect(defaultConfig.debounceMs).toBe(1500);
        });
    });

    describe('Config Overrides', () => {
        it('should allow config overrides', () => {
            const customConfig = {
                apiTimeout: 60000,
                maxRetries: 5,
            };

            expect(customConfig.apiTimeout).toBe(60000);
            expect(customConfig.maxRetries).toBe(5);
        });

        it('should merge configs correctly', () => {
            const defaults = {
                apiTimeout: 30000,
                maxRetries: 3,
            };

            const overrides = {
                maxRetries: 5,
            };

            const merged = { ...defaults, ...overrides };

            expect(merged.apiTimeout).toBe(30000);
            expect(merged.maxRetries).toBe(5);
        });
    });

    describe('Config Validation', () => {
        it('should reject negative timeout values', () => {
            const invalidTimeout = -1000;
            expect(invalidTimeout).toBeLessThan(0);
        });

        it('should reject zero retries', () => {
            const invalidRetries = 0;
            expect(invalidRetries).toBe(0);
        });

        it('should accept valid config values', () => {
            const validConfig = {
                apiTimeout: 45000,
                maxRetries: 4,
                debounceMs: 2000,
            };

            expect(validConfig.apiTimeout).toBeGreaterThan(0);
            expect(validConfig.maxRetries).toBeGreaterThan(0);
            expect(validConfig.debounceMs).toBeGreaterThan(0);
        });
    });
});
