import { describe, expect, it } from 'vitest';
import { runLiveEvalSuite } from './live-eval-suite';

const shouldRunLiveEval = process.env.RUN_LIVE_EVAL === 'true';
const allowFailures = process.env.LIVE_EVAL_ALLOW_FAILURE === 'true';
const suite = shouldRunLiveEval ? describe : describe.skip;

suite('live eval suite', () => {
  it(
    'runs generation and modification eval cases through the real pipelines',
    async () => {
      const report = await runLiveEvalSuite();
      expect(report.summary.totalCases).toBeGreaterThan(0);
      expect(report.generation.length).toBeGreaterThan(0);

      if (!allowFailures) {
        expect(report.summary.totalPassed).toBe(report.summary.totalCases);
      }
    },
    10 * 60 * 1000,
  );
});

