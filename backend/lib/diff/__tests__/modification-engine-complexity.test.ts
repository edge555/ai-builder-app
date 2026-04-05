/**
 * Tests for classifyModificationComplexity
 *
 * Covers:
 * - normal modification requests always run intent + planning
 * - errorContext present → skip both (repair mode)
 */

import { describe, it, expect } from 'vitest';
import { classifyModificationComplexity } from '../modification-engine';
import type { CodeSlice } from '../../analysis/file-planner/types';
import type { ErrorContext } from '../repair-file-selector';

function makeSlices(primaryCount: number, contextCount: number = 0): CodeSlice[] {
  const slices: CodeSlice[] = [];
  for (let i = 0; i < primaryCount; i++) {
    slices.push({ filePath: `src/file${i}.ts`, content: 'export const x = 1;', relevance: 'primary' });
  }
  for (let i = 0; i < contextCount; i++) {
    slices.push({ filePath: `src/ctx${i}.ts`, content: 'export const y = 2;', relevance: 'context' });
  }
  return slices;
}

const ERROR_CONTEXT: ErrorContext = {
  errorType: 'build',
  errorText: 'Cannot find module',
  failingFiles: ['src/App.tsx'],
};

describe('classifyModificationComplexity', () => {
  it('runs both when primary file count is 0 (edge case)', () => {
    const result = classifyModificationComplexity(makeSlices(0), 10);
    expect(result).toEqual({ skipIntent: false, skipPlanning: false });
  });

  it('runs both when primary file count is 1', () => {
    const result = classifyModificationComplexity(makeSlices(1), 10);
    expect(result).toEqual({ skipIntent: false, skipPlanning: false });
  });

  it('runs both when primary file count is 2 (boundary)', () => {
    const result = classifyModificationComplexity(makeSlices(2), 10);
    expect(result).toEqual({ skipIntent: false, skipPlanning: false });
  });

  it('skips both when errorContext is present (repair mode)', () => {
    const result = classifyModificationComplexity(makeSlices(5), 15, ERROR_CONTEXT);
    expect(result).toEqual({ skipIntent: true, skipPlanning: true });
  });

  it('errorContext takes priority even with many primary files + large project', () => {
    const result = classifyModificationComplexity(makeSlices(10), 20, ERROR_CONTEXT);
    expect(result).toEqual({ skipIntent: true, skipPlanning: true });
  });

  it('runs both when >2 primary files AND >8 project files', () => {
    const result = classifyModificationComplexity(makeSlices(3), 9);
    expect(result).toEqual({ skipIntent: false, skipPlanning: false });
  });

  it('runs both with more primary files in a large project', () => {
    const result = classifyModificationComplexity(makeSlices(6), 15);
    expect(result).toEqual({ skipIntent: false, skipPlanning: false });
  });

  it('still runs both when >2 primary files AND <=8 project files (small project)', () => {
    const result = classifyModificationComplexity(makeSlices(3), 8);
    expect(result).toEqual({ skipIntent: false, skipPlanning: false });
  });

  it('still runs both when >2 primary + exactly 8 project files (boundary)', () => {
    const result = classifyModificationComplexity(makeSlices(4), 8);
    expect(result).toEqual({ skipIntent: false, skipPlanning: false });
  });

  it('context slices do not change the standard run-both behavior', () => {
    const result = classifyModificationComplexity(makeSlices(2, 8), 20);
    expect(result).toEqual({ skipIntent: false, skipPlanning: false });
  });
});
