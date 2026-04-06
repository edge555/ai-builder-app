/**
 * Tests for classifyModificationComplexity
 */

import { describe, expect, it } from 'vitest';
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
  affectedFiles: ['src/App.tsx'],
  errorType: 'build',
};

describe('classifyModificationComplexity', () => {
  it('uses full routing when no primary files are identified', () => {
    const result = classifyModificationComplexity(makeSlices(0), 10, undefined, 'change the title');
    expect(result).toMatchObject({ skipIntent: false, skipPlanning: false, mode: 'full' });
  });

  it('uses direct routing for a simple one-file edit', () => {
    const result = classifyModificationComplexity(makeSlices(1), 10, undefined, 'change the submit button text');
    expect(result).toMatchObject({
      skipIntent: true,
      skipPlanning: true,
      enforceTargetedChanges: true,
      mode: 'direct',
    });
  });

  it('uses direct routing for a simple two-file edit', () => {
    const result = classifyModificationComplexity(makeSlices(2), 10, undefined, 'fix the header spacing');
    expect(result).toMatchObject({
      skipIntent: true,
      skipPlanning: true,
      mode: 'direct',
    });
  });

  it('skips both when errorContext is present', () => {
    const result = classifyModificationComplexity(makeSlices(5), 15, ERROR_CONTEXT, 'fix the build');
    expect(result).toMatchObject({ skipIntent: true, skipPlanning: true, mode: 'repair' });
  });

  it('uses scoped routing for a small project with narrow file scope', () => {
    const result = classifyModificationComplexity(makeSlices(2), 8, undefined, 'improve validation');
    expect(result).toMatchObject({
      skipIntent: true,
      skipPlanning: false,
      mode: 'scoped',
    });
  });

  it('uses full routing with more primary files in a large project', () => {
    const result = classifyModificationComplexity(makeSlices(6), 15, undefined, 'update the dashboard experience');
    expect(result).toMatchObject({ skipIntent: false, skipPlanning: false, mode: 'full' });
  });

  it('stays on full routing for complex prompts even with a small file count', () => {
    const result = classifyModificationComplexity(makeSlices(2), 8, undefined, 'refactor the authentication architecture');
    expect(result).toMatchObject({ skipIntent: false, skipPlanning: false, mode: 'full' });
  });

  it('context slices do not prevent a direct route for simple prompts in small projects', () => {
    const result = classifyModificationComplexity(makeSlices(2, 8), 10, undefined, 'rename the call to action');
    expect(result).toMatchObject({ skipIntent: true, skipPlanning: true, mode: 'direct' });
  });

  it('uses full routing for large projects even with a simple prompt', () => {
    // projectFileCount > SMALL_PROJECT_FILE_THRESHOLD → no direct/scoped shortcut
    const result = classifyModificationComplexity(makeSlices(2), 20, undefined, 'rename the call to action');
    expect(result).toMatchObject({ skipIntent: false, skipPlanning: false, mode: 'full' });
  });

  it('uses full routing when primaryCount exceeds 2, even for simple prompts and small projects', () => {
    const result = classifyModificationComplexity(makeSlices(3), 8, undefined, 'change the button color');
    expect(result).toMatchObject({ skipIntent: false, skipPlanning: false, mode: 'full' });
  });

  it('returns scoped mode for an empty prompt (no simple verb → not direct)', () => {
    const result = classifyModificationComplexity(makeSlices(1), 5, undefined, '');
    expect(result.mode).toBe('scoped');
    expect(result.mode).not.toBe('direct');
  });

  it('returns scoped mode for a prompt longer than SIMPLE_PROMPT_MAX_LENGTH (over length limit → not direct)', () => {
    const longPrompt = 'change ' + 'x'.repeat(215);
    const result = classifyModificationComplexity(makeSlices(1), 5, undefined, longPrompt);
    expect(result.mode).toBe('scoped');
    expect(result.mode).not.toBe('direct');
  });

  it('returns full mode when a complex cue word appears alongside a simple verb', () => {
    const result = classifyModificationComplexity(makeSlices(1), 5, undefined, 'refactor and update the header');
    expect(result.mode).toBe('full');
  });
});
