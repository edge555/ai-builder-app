import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiCache } from '../../ai/gemini-cache';

describe('GeminiCache', () => {
    let cache: GeminiCache;

    beforeEach(() => {
        vi.useFakeTimers();
        cache = new GeminiCache(
            'https://api.test.com',
            'test-key',
            'gemini-2.5-flash',
            5000
        );
    });

    afterEach(() => {
        cache.destroy();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('cleanup()', () => {
        it('should remove expired entries', async () => {
            // Mock fetch to return a valid response
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ name: 'cached-content-1' }),
            });

            // Create a cache entry
            await cache.getOrCreateCachedContent('test instruction 1');

            // Verify cache has 1 entry
            expect(cache.getStats().size).toBe(1);

            // Fast-forward time by 6 minutes (past TTL of 5 minutes)
            vi.advanceTimersByTime(6 * 60 * 1000);

            // Trigger cleanup by calling getOrCreateCachedContent
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ name: 'cached-content-2' }),
            });
            await cache.getOrCreateCachedContent('test instruction 2');

            // First entry should be cleaned up, second should be added
            const stats = cache.getStats();
            expect(stats.size).toBe(1);
            expect(stats.expiryCleanups).toBe(1);
        });

        it('should be called periodically every 5 minutes', () => {
            const cleanupSpy = vi.spyOn(cache as any, 'cleanup');

            // Fast-forward 5 minutes
            vi.advanceTimersByTime(5 * 60 * 1000);
            expect(cleanupSpy).toHaveBeenCalledTimes(1);

            // Fast-forward another 5 minutes
            vi.advanceTimersByTime(5 * 60 * 1000);
            expect(cleanupSpy).toHaveBeenCalledTimes(2);
        });
    });

    describe('LRU eviction', () => {
        it('should evict least recently used entries when maxSize is exceeded', async () => {
            // Mock fetch to return valid responses
            global.fetch = vi.fn().mockImplementation(() => {
                const callCount = (global.fetch as any).mock.calls.length;
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ name: `cached-content-${callCount}` }),
                });
            });

            // Create 101 cache entries (maxSize is 100)
            for (let i = 0; i < 101; i++) {
                await cache.getOrCreateCachedContent(`test instruction ${i}`);
            }

            // Cache should be limited to 100 entries
            const stats = cache.getStats();
            expect(stats.size).toBe(100);
            expect(stats.evictions).toBe(1);
        });

        it('should evict oldest accessed entries first', async () => {
            // Mock fetch
            global.fetch = vi.fn().mockImplementation(() => {
                const callCount = (global.fetch as any).mock.calls.length;
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ name: `cached-content-${callCount}` }),
                });
            });

            // Create 3 entries
            await cache.getOrCreateCachedContent('instruction-1');
            vi.advanceTimersByTime(1000);
            await cache.getOrCreateCachedContent('instruction-2');
            vi.advanceTimersByTime(1000);
            await cache.getOrCreateCachedContent('instruction-3');

            // Access instruction-1 again to make it recently used
            await cache.getOrCreateCachedContent('instruction-1');

            // Manually set maxSize to 2 for testing
            (cache as any).maxSize = 2;

            // Add a new entry, should evict instruction-2 (oldest accessed)
            await cache.getOrCreateCachedContent('instruction-4');

            expect(cache.getStats().size).toBe(2);
            expect(cache.getStats().evictions).toBeGreaterThan(0);
        });
    });

    describe('statistics', () => {
        it('should track cache hits and misses', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ name: 'cached-content-1' }),
            });

            // First call - miss
            await cache.getOrCreateCachedContent('test instruction');
            expect(cache.getStats().hits).toBe(0);
            expect(cache.getStats().misses).toBe(1);

            // Second call - hit
            await cache.getOrCreateCachedContent('test instruction');
            expect(cache.getStats().hits).toBe(1);
            expect(cache.getStats().misses).toBe(1);

            // Third call - hit
            await cache.getOrCreateCachedContent('test instruction');
            expect(cache.getStats().hits).toBe(2);
            expect(cache.getStats().misses).toBe(1);
        });

        it('should calculate hit rate correctly', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ name: 'cached-content-1' }),
            });

            // 1 miss
            await cache.getOrCreateCachedContent('test instruction');

            // 3 hits
            await cache.getOrCreateCachedContent('test instruction');
            await cache.getOrCreateCachedContent('test instruction');
            await cache.getOrCreateCachedContent('test instruction');

            const stats = cache.getStats();
            expect(stats.hitRate).toBe(0.75); // 3 hits out of 4 total operations
        });
    });

    describe('clear()', () => {
        it('should clear all cache entries and reset statistics', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ name: 'cached-content-1' }),
            });

            // Add some entries
            await cache.getOrCreateCachedContent('instruction-1');
            await cache.getOrCreateCachedContent('instruction-2');
            await cache.getOrCreateCachedContent('instruction-1'); // hit

            expect(cache.getStats().size).toBe(2);
            expect(cache.getStats().hits).toBe(1);
            expect(cache.getStats().misses).toBe(2);

            // Clear cache
            cache.clear();

            const stats = cache.getStats();
            expect(stats.size).toBe(0);
            expect(stats.hits).toBe(0);
            expect(stats.misses).toBe(0);
            expect(stats.evictions).toBe(0);
            expect(stats.expiryCleanups).toBe(0);
        });
    });

    describe('destroy()', () => {
        it('should stop the periodic cleanup timer', () => {
            const cleanupSpy = vi.spyOn(cache as any, 'cleanup');

            // Destroy the cache
            cache.destroy();

            // Fast-forward time by 5 minutes
            vi.advanceTimersByTime(5 * 60 * 1000);

            // Cleanup should not be called
            expect(cleanupSpy).not.toHaveBeenCalled();
        });
    });

    describe('getStats()', () => {
        it('should return current cache statistics with size and hit rate', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ name: 'cached-content-1' }),
            });

            await cache.getOrCreateCachedContent('instruction-1');
            await cache.getOrCreateCachedContent('instruction-1');

            const stats = cache.getStats();
            expect(stats).toMatchObject({
                size: 1,
                hits: 1,
                misses: 1,
                evictions: 0,
                expiryCleanups: 0,
                hitRate: 0.5,
            });
        });
    });
});
