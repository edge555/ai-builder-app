import { describe, expect, it } from 'vitest';
import { runLiveEvalSuite, DEFAULT_LIVE_GENERATION_CASES } from './live-eval-suite';

const shouldRun = process.env.RUN_CLASSROOM_BASELINE === 'true';
const suite = shouldRun ? describe : describe.skip;

const CLASSROOM_CASES = DEFAULT_LIVE_GENERATION_CASES.filter((c) =>
  c.id.startsWith('classroom-'),
);

suite('classroom baseline eval', () => {
  it(
    'measures pass rate on 5 classroom prompts (counter, todo, quiz, form-tracker, calculator)',
    async () => {
      const report = await runLiveEvalSuite({
        generationCases: CLASSROOM_CASES,
        modificationCases: [],
        reportPath: 'data/classroom-baseline-report.json',
      });

      console.log('\n=== CLASSROOM BASELINE ===');
      console.log(`Pass rate: ${report.summary.generationPassed}/${report.summary.generationTotal}`);

      for (const result of report.generation) {
        const status = result.passed ? 'PASS' : 'FAIL';
        console.log(`  [${status}] ${result.caseId} (${result.durationMs}ms, ${result.generatedFileCount} files)`);
        if (result.error) console.log(`         error: ${result.error}`);
        if (result.evaluation?.issues?.length) console.log(`         issues: ${result.evaluation.issues.join(' | ')}`);
      }
      console.log('');

      expect(report.summary.generationTotal).toBe(CLASSROOM_CASES.length);
      // Baseline gate: if < 30% pass we need to pivot strategy (design doc criterion)
      const passRate = report.summary.generationPassed / report.summary.generationTotal;
      console.log(`Pass rate: ${(passRate * 100).toFixed(0)}% — design doc pivot threshold is 30%`);
    },
    40 * 60 * 1000, // 40 minutes for 5 sequential API calls
  );
});
