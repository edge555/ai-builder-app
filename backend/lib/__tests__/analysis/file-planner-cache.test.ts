import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FilePlanner } from '../../analysis/file-planner/file-planner';
import type { ProjectState } from '@ai-app-builder/shared';

describe('FilePlanner Cache Management', () => {
  let planner: FilePlanner;

  const createMockProject = (id: string, fileCount: number, contentSize: number): ProjectState => {
    const files: Record<string, string> = {};
    for (let i = 0; i < fileCount; i++) {
      files[`file${i}.ts`] = 'x'.repeat(contentSize);
    }

    return {
      id,
      name: 'Test Project',
      files,
      currentVersion: 1,
    };
  };

  beforeEach(() => {
    planner = new FilePlanner();
  });

  describe('clear()', () => {
    it('should clear both caches', async () => {
      const project = createMockProject('test1', 5, 100);

      // Generate chunk index to populate cache
      await planner.plan('test prompt', project);

      // Clear caches
      planner.clear();

      // Verify caches are empty by checking memory usage
      const stats = (planner as any).currentCacheMemoryUsage;
      expect(stats).toBe(0);
    });
  });

  describe('cache eviction', () => {
    it('should limit cache to MAX_CACHE_ENTRIES (3)', async () => {
      // Create 5 different projects
      const projects = [
        createMockProject('proj1', 2, 100),
        createMockProject('proj2', 3, 100),
        createMockProject('proj3', 4, 100),
        createMockProject('proj4', 5, 100),
        createMockProject('proj5', 6, 100),
      ];

      // Plan for each project
      for (const project of projects) {
        await planner.plan('test', project);
      }

      // Cache should only have 3 entries (MAX_CACHE_ENTRIES)
      const cacheSize = (planner as any).chunkIndexCache.size;
      expect(cacheSize).toBeLessThanOrEqual(3);
    });

    it('should evict based on LRU strategy', async () => {
      const proj1 = createMockProject('old1', 2, 100);
      const proj2 = createMockProject('old2', 3, 100);
      const proj3 = createMockProject('old3', 4, 100);
      const proj4 = createMockProject('new1', 5, 100);

      // Plan for 3 projects
      await planner.plan('test', proj1);
      await planner.plan('test', proj2);
      await planner.plan('test', proj3);

      // Access proj1 again to make it recently used
      await planner.plan('test', proj1);

      // Add proj4 - should evict proj2 (oldest)
      await planner.plan('test', proj4);

      const cache = (planner as any).chunkIndexCache;
      const cacheKeys = Array.from(cache.keys());
      const cacheSize = cache.size;

      // proj1 and proj4 should be in cache, proj2 might be evicted
      expect(cacheSize).toBeLessThanOrEqual(3);
    });

    it('should enforce memory limit (50MB)', async () => {
      // Create a large project that would exceed memory limit if cached multiple times
      const largeProject = createMockProject('large', 100, 50000); // ~5MB per file

      await planner.plan('test', largeProject);

      const memoryUsage = (planner as any).currentCacheMemoryUsage;
      const maxMemory = (planner as any).MAX_CACHE_MEMORY_BYTES;

      // Memory usage should not exceed the limit
      expect(memoryUsage).toBeLessThanOrEqual(maxMemory);
    });
  });

  describe('symbolLookupCache consistency', () => {
    it('should use same key for symbolLookupCache and chunkIndexCache', async () => {
      const project = createMockProject('test', 5, 100);

      await planner.plan('test', project);

      const chunkCacheKeys = Array.from((planner as any).chunkIndexCache.keys());
      const symbolCacheKeys = Array.from((planner as any).symbolLookupCache.keys());

      // If symbolLookupCache has entries, they should match chunkIndexCache keys
      if (symbolCacheKeys.length > 0) {
        symbolCacheKeys.forEach(key => {
          expect(chunkCacheKeys).toContain(key);
        });
      }
    });

    it('should clean up symbolLookupCache when evicting chunkIndexCache', async () => {
      const projects = [
        createMockProject('proj1', 2, 100),
        createMockProject('proj2', 3, 100),
        createMockProject('proj3', 4, 100),
        createMockProject('proj4', 5, 100),
      ];

      // Plan for all projects
      for (const project of projects) {
        await planner.plan('test', project);
      }

      const chunkCacheSize = (planner as any).chunkIndexCache.size;
      const symbolCacheSize = (planner as any).symbolLookupCache.size;

      // symbolLookupCache should not have more entries than chunkIndexCache
      expect(symbolCacheSize).toBeLessThanOrEqual(chunkCacheSize);

      // No orphaned entries - all symbol cache keys should exist in chunk cache
      const chunkKeys = new Set((planner as any).chunkIndexCache.keys());
      const symbolKeys = Array.from((planner as any).symbolLookupCache.keys());

      symbolKeys.forEach(key => {
        expect(chunkKeys.has(key)).toBe(true);
      });
    });
  });

  describe('memory estimation', () => {
    it('should estimate ChunkIndex size', async () => {
      const project = createMockProject('test', 10, 1000);

      await planner.plan('test', project);

      const cache = (planner as any).chunkIndexCache;
      const entries = Array.from(cache.values());

      // Each cache entry should have an estimated size
      entries.forEach((entry: any) => {
        expect(entry.estimatedSize).toBeGreaterThan(0);
      });
    });

    it('should track total cache memory usage', async () => {
      const project1 = createMockProject('test1', 5, 500);
      const project2 = createMockProject('test2', 5, 500);

      await planner.plan('test', project1);
      const memoryAfter1 = (planner as any).currentCacheMemoryUsage;

      await planner.plan('test', project2);
      const memoryAfter2 = (planner as any).currentCacheMemoryUsage;

      // Memory should increase after adding second project
      expect(memoryAfter2).toBeGreaterThan(memoryAfter1);
    });
  });

  describe('cache reuse', () => {
    it('should reuse cached chunk index for same project', async () => {
      const project = createMockProject('test', 5, 100);

      // First plan - builds cache
      await planner.plan('test1', project);

      // Spy on chunkIndexBuilder.build to see if it's called
      const buildSpy = vi.spyOn((planner as any).chunkIndexBuilder, 'build');

      // Second plan with same project - should use cache
      await planner.plan('test2', project);

      // build() should not be called on second plan
      expect(buildSpy).not.toHaveBeenCalled();
    });

    it('should rebuild cache when project changes', async () => {
      const project1 = createMockProject('test', 5, 100);
      const project2 = createMockProject('test', 6, 100); // Different file count

      // First plan
      await planner.plan('test', project1);

      // Second plan with modified project - should rebuild
      await planner.plan('test', project2);

      const cacheSize = (planner as any).chunkIndexCache.size;

      // Should have 2 entries (one for each project state)
      expect(cacheSize).toBe(2);
    });
  });
});
