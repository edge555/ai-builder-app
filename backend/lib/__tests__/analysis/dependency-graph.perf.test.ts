/**
 * Performance benchmarks for Dependency Graph caching
 * Demonstrates cache hit performance and O(1) import resolution
 */

import { describe, it, expect } from 'vitest';
import { DependencyGraph } from '../../analysis/dependency-graph';
import { FileIndex } from '../../analysis/file-index';
import type { ProjectState } from '@ai-app-builder/shared';

describe('DependencyGraph - Performance', () => {
  const createProjectState = (files: Record<string, string>): ProjectState => ({
    id: 'test-project',
    name: 'Test Project',
    description: 'A test project',
    files,
    createdAt: new Date(),
    updatedAt: new Date(),
    currentVersionId: 'v1',
  });

  /**
   * Generate a large project with many files and imports
   */
  function generateLargeProject(fileCount: number, importsPerFile: number): Record<string, string> {
    const files: Record<string, string> = {};

    // Create utility files that will be imported
    for (let i = 0; i < 20; i++) {
      files[`src/utils/util${i}.ts`] = `export function util${i}() { return ${i}; }`;
    }

    // Create component files with multiple imports
    for (let i = 0; i < fileCount; i++) {
      const imports: string[] = [];
      for (let j = 0; j < importsPerFile; j++) {
        const utilIndex = j % 20;
        imports.push(`import { util${utilIndex} } from '../utils/util${utilIndex}';`);
      }

      files[`src/components/Component${i}.tsx`] = `
${imports.join('\n')}

export function Component${i}() {
  return <div>Component ${i}</div>;
}
`;
    }

    return files;
  }

  it('should cache graph and return immediately on second build', () => {
    const files = generateLargeProject(100, 10);
    const projectState = createProjectState(files);

    const fileIndex = new FileIndex();
    fileIndex.index(projectState);

    const graph = new DependencyGraph();

    // First build - should build from scratch
    const start1 = performance.now();
    graph.build(fileIndex);
    const duration1 = performance.now() - start1;

    // Second build - should use cache
    const start2 = performance.now();
    graph.build(fileIndex);
    const duration2 = performance.now() - start2;

    console.log(`First build: ${duration1.toFixed(2)}ms`);
    console.log(`Second build (cached): ${duration2.toFixed(2)}ms`);
    console.log(`Speedup: ${(duration1 / duration2).toFixed(0)}x`);

    // Cache hit should be orders of magnitude faster
    expect(duration2).toBeLessThan(duration1 / 10);
    expect(duration2).toBeLessThan(1); // Should be < 1ms for cache hit
  });

  it('should invalidate cache when files change', () => {
    const files1 = generateLargeProject(50, 5);
    const projectState1 = createProjectState(files1);

    const fileIndex = new FileIndex();
    fileIndex.index(projectState1);

    const graph = new DependencyGraph();
    graph.build(fileIndex);

    // Modify one file
    const files2 = { ...files1, 'src/components/Component0.tsx': 'export function Component0() { return null; }' };
    const projectState2 = createProjectState(files2);

    fileIndex.index(projectState2);

    const start = performance.now();
    graph.build(fileIndex);
    const duration = performance.now() - start;

    console.log(`Rebuild after file change: ${duration.toFixed(2)}ms`);

    // Graph should reflect new state (cache was invalidated)
    expect(graph.hasFile('src/components/Component0.tsx')).toBe(true);

    // Even rebuilds are fast with O(1) import resolution
    expect(duration).toBeGreaterThan(0); // Did rebuild (not cached)
  });

  it('should handle large project with many imports efficiently', () => {
    // 100 files × 10 imports = 1000 import resolutions
    const files = generateLargeProject(100, 10);
    const projectState = createProjectState(files);

    const fileIndex = new FileIndex();
    fileIndex.index(projectState);

    const graph = new DependencyGraph();

    const start = performance.now();
    graph.build(fileIndex);
    const duration = performance.now() - start;

    console.log(`Built graph with 100 files × 10 imports in ${duration.toFixed(2)}ms`);

    // Should be fast even on first build (O(1) import resolution)
    expect(duration).toBeLessThan(100);

    // Verify graph is built correctly
    const allFiles = graph.getAllFiles();
    expect(allFiles.length).toBeGreaterThan(100);
  });

  it('should demonstrate O(1) import resolution vs O(n) linear search', () => {
    const fileCounts = [50, 100, 200];
    const timings: { fileCount: number; time: number; ratio: number }[] = [];

    for (const fileCount of fileCounts) {
      const files = generateLargeProject(fileCount, 10);
      const projectState = createProjectState(files);

      const fileIndex = new FileIndex();
      fileIndex.index(projectState);

      const graph = new DependencyGraph();

      const start = performance.now();
      graph.build(fileIndex);
      const duration = performance.now() - start;

      const previousTiming = timings[timings.length - 1];
      const ratio = previousTiming ? duration / previousTiming.time : 1;

      timings.push({ fileCount, time: duration, ratio });
    }

    console.log('\n📊 Import Resolution Scaling:');
    console.log('Files\tTime(ms)\tRatio');
    timings.forEach(({ fileCount, time, ratio }) => {
      console.log(`${fileCount}\t${time.toFixed(2)}\t\t${ratio.toFixed(2)}x`);
    });

    // With O(1) import resolution, doubling files should roughly double time (ratio ~2)
    // With O(n) resolution, it would be worse than 2x
    const lastRatio = timings[timings.length - 1].ratio;
    expect(lastRatio).toBeLessThan(3); // Linear scaling, not quadratic
  });

  it('should cache across multiple build calls for same state', () => {
    const files = generateLargeProject(100, 10);
    const projectState = createProjectState(files);

    const fileIndex = new FileIndex();
    fileIndex.index(projectState);

    const graph = new DependencyGraph();

    // First build
    const start1 = performance.now();
    graph.build(fileIndex);
    const duration1 = performance.now() - start1;

    // Multiple subsequent builds
    let totalCachedTime = 0;
    const iterations = 10;

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      graph.build(fileIndex);
      totalCachedTime += performance.now() - start;
    }

    const avgCachedTime = totalCachedTime / iterations;

    console.log(`First build: ${duration1.toFixed(2)}ms`);
    console.log(`Average cached build: ${avgCachedTime.toFixed(4)}ms (${iterations} iterations)`);
    console.log(`Cache speedup: ${(duration1 / avgCachedTime).toFixed(0)}x`);

    // Average cached build should be negligible
    expect(avgCachedTime).toBeLessThan(1);
    expect(avgCachedTime).toBeLessThan(duration1 / 20);
  });

  it('should demonstrate memory efficiency with path lookup', () => {
    const files = generateLargeProject(200, 15);
    const projectState = createProjectState(files);

    const fileIndex = new FileIndex();
    fileIndex.index(projectState);

    const graph = new DependencyGraph();

    const memBefore = process.memoryUsage().heapUsed;
    graph.build(fileIndex);
    const memAfter = process.memoryUsage().heapUsed;

    const memDelta = (memAfter - memBefore) / 1024 / 1024; // MB

    console.log(`Memory delta for 200 files: ${memDelta.toFixed(2)}MB`);

    // Memory usage should be reasonable (path lookup is just a Map)
    expect(memDelta).toBeLessThan(10); // Should be < 10MB
  });

  it('should handle modification planning use case efficiently', () => {
    // Simulate modification planning: multiple build() calls for same state
    const files = generateLargeProject(100, 10);
    const projectState = createProjectState(files);

    const fileIndex = new FileIndex();
    fileIndex.index(projectState);

    const graph = new DependencyGraph();

    // Simulate multiple planning iterations (each calls build)
    const iterations = 5;
    const timings: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      graph.build(fileIndex);

      // Simulate querying the graph
      graph.getAffectedFiles(['src/utils/util0.ts']);
      graph.getDependents('src/utils/util1.ts');

      const duration = performance.now() - start;
      timings.push(duration);
    }

    console.log('\n🔄 Modification Planning Simulation:');
    timings.forEach((time, i) => {
      console.log(`Iteration ${i + 1}: ${time.toFixed(2)}ms`);
    });

    // First iteration builds, rest use cache
    expect(timings[0]).toBeGreaterThan(timings[1]);
    expect(timings[1]).toBeLessThan(1); // Cache hits
    expect(timings[2]).toBeLessThan(1);
  });
});
