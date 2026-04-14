import { describe, it, expect } from 'vitest';
import { getMetricsSummary, recordGenerationStageTiming } from '../metrics';

describe('metrics generation stage timing', () => {
  it('reports count, avg, p50, and p95 for a recorded stage', () => {
    const stage = `test.stage.${Date.now()}`;
    [10, 20, 30, 40, 50].forEach((duration) => {
      recordGenerationStageTiming(stage, duration);
    });

    const summary = getMetricsSummary();
    const stats = summary.generationStageTiming[stage];

    expect(stats).toBeDefined();
    expect(stats.count).toBe(5);
    expect(stats.avgDurationMs).toBe(30);
    expect(stats.p50Ms).toBe(30);
    expect(stats.p95Ms).toBe(50);
  });
});
