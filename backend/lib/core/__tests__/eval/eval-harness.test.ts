import { describe, expect, it } from 'vitest';
import { GENERATION_EVAL_CASES, MODIFICATION_EVAL_CASES } from './eval-cases';
import { runGenerationEvalCase, runModificationEvalCase } from './eval-harness';

describe('generation eval harness', () => {
  it('passes beginner generation benchmark cases', () => {
    for (const evalCase of GENERATION_EVAL_CASES) {
      const result = runGenerationEvalCase(evalCase);
      expect(result.passed).toBe(true);
      expect(result.acceptancePassed).toBe(true);
      expect(result.runtimePassed).toBe(true);
    }
  });
});

describe('modification eval harness', () => {
  it('passes simple modification benchmark cases', () => {
    for (const evalCase of MODIFICATION_EVAL_CASES) {
      const result = runModificationEvalCase(evalCase);
      expect(result.passed).toBe(true);
      expect(result.acceptancePassed).toBe(true);
      expect(result.runtimePassed).toBe(true);
      expect(result.changedFiles).toEqual(expect.arrayContaining(evalCase.requiredChangedFiles));
    }
  });
});
