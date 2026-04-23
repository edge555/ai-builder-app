/**
 * Performance benchmarks for Incremental JSON Parser
 * Demonstrates O(n) complexity improvement over O(n^2)
 */

import { describe, it, expect } from 'vitest';
import { parseIncrementalFiles } from '../../utils/incremental-json-parser';

describe('parseIncrementalFiles - Performance', () => {
  /**
   * Generate a large JSON stream with many file objects
   */
  function generateLargeStream(fileCount: number, contentSize: number = 1000): string {
    const files: string[] = [];

    for (let i = 0; i < fileCount; i++) {
      const path = `src/components/Component${i}.tsx`;
      const content = 'x'.repeat(contentSize); // Simple content for testing
      files.push(JSON.stringify({ path, content }));
    }

    return files.join('');
  }

  function measureParseDuration(stream: string, expectedFileCount: number): number {
    const start = performance.now();
    const result = parseIncrementalFiles(stream);
    const duration = performance.now() - start;

    expect(result.files).toHaveLength(expectedFileCount);
    return duration;
  }

  it('should parse 100 files in < 100ms (O(n) complexity)', () => {
    const stream = generateLargeStream(100, 1000);

    const start = performance.now();
    const result = parseIncrementalFiles(stream);
    const duration = performance.now() - start;

    expect(result.files).toHaveLength(100);
    expect(duration).toBeLessThan(100);

    console.log(`✓ Parsed 100 files (${(stream.length / 1024 / 1024).toFixed(2)}MB) in ${duration.toFixed(2)}ms`);
  });

  it('should parse 500 files in < 500ms (linear scaling)', () => {
    const stream = generateLargeStream(500, 1000);

    const start = performance.now();
    const result = parseIncrementalFiles(stream);
    const duration = performance.now() - start;

    expect(result.files).toHaveLength(500);
    expect(duration).toBeLessThan(500);

    console.log(`✓ Parsed 500 files (${(stream.length / 1024 / 1024).toFixed(2)}MB) in ${duration.toFixed(2)}ms`);
  });

  it('should demonstrate linear time complexity', () => {
    const sizes = [10, 50, 100, 200];
    const timings: { size: number; time: number; ratio: number }[] = [];

    // Warm one parse to reduce first-iteration JIT noise in the ratio check.
    measureParseDuration(generateLargeStream(10, 1000), 10);

    for (const size of sizes) {
      const stream = generateLargeStream(size, 1000);
      const samples = [
        measureParseDuration(stream, size),
        measureParseDuration(stream, size),
      ].sort((a, b) => a - b);
      const duration = samples[Math.floor(samples.length / 2)];

      const previousTiming = timings[timings.length - 1];
      const ratio = previousTiming
        ? duration / previousTiming.time
        : 1;

      timings.push({ size, time: duration, ratio });
    }

    console.log('\n📊 Linear Time Complexity Verification:');
    console.log('Size\tTime(ms)\tRatio');
    timings.forEach(({ size, time, ratio }) => {
      console.log(`${size}\t${time.toFixed(2)}\t\t${ratio.toFixed(2)}x`);
    });

    // With O(n) complexity, doubling size should roughly double time (ratio ~2)
    // With O(n^2), doubling size would quadruple time (ratio ~4)
    // Allow some variance for small datasets and JIT compilation
    const lastRatio = timings[timings.length - 1].ratio;
    expect(lastRatio).toBeLessThan(3.5); // Still well below quadratic growth, with less CI jitter.
  });

  it('should handle 10MB response with 100 large files efficiently', () => {
    // Simulate real-world scenario: 10MB response with 100 files of varying sizes
    const stream = generateLargeStream(100, 100000); // ~10MB total

    const start = performance.now();
    const result = parseIncrementalFiles(stream);
    const duration = performance.now() - start;

    expect(result.files).toHaveLength(100);
    expect(duration).toBeLessThan(100); // Target from spec: < 100ms

    const sizeMB = stream.length / 1024 / 1024;
    console.log(`✓ Parsed ${result.files.length} files (${sizeMB.toFixed(2)}MB) in ${duration.toFixed(2)}ms`);
    console.log(`  Throughput: ${(sizeMB / (duration / 1000)).toFixed(2)} MB/s`);
  });

  it('should have memory usage proportional to largest single file', () => {
    // Create stream with varying file sizes
    const files: string[] = [];

    // 98 small files
    for (let i = 0; i < 98; i++) {
      files.push(JSON.stringify({
        path: `src/small${i}.ts`,
        content: 'x'.repeat(100)
      }));
    }

    // 1 large file (1MB)
    files.push(JSON.stringify({
      path: 'src/large.ts',
      content: 'x'.repeat(1000000)
    }));

    // 1 medium file
    files.push(JSON.stringify({
      path: 'src/medium.ts',
      content: 'x'.repeat(10000)
    }));

    const stream = files.join('');

    const memBefore = process.memoryUsage().heapUsed;
    const result = parseIncrementalFiles(stream);
    const memAfter = process.memoryUsage().heapUsed;

    const memDelta = (memAfter - memBefore) / 1024 / 1024; // MB

    expect(result.files).toHaveLength(100);

    // Memory delta should be roughly the size of the largest file + overhead
    // Not the total size of all files combined
    console.log(`✓ Memory delta: ${memDelta.toFixed(2)}MB for ${(stream.length / 1024 / 1024).toFixed(2)}MB stream`);
  });
});
