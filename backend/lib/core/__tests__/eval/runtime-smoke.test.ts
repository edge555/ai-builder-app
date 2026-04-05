import { describe, expect, it } from 'vitest';
import { BROKEN_RUNTIME_OUTPUT, SIMPLE_COUNTER_OUTPUT } from './fixtures';
import { runRuntimeSmokeTest } from './runtime-smoke';

describe('runtime smoke harness', () => {
  it('passes a valid beginner Vite app snapshot', () => {
    const result = runRuntimeSmokeTest(
      Object.fromEntries(SIMPLE_COUNTER_OUTPUT.files.map((file) => [file.path, file.content])),
    );

    expect(result.passed).toBe(true);
    expect(result.framework).toBe('vite-react');
    expect(result.interactionSignals).toEqual(expect.arrayContaining(['button', 'onClick']));
  });

  it('fails obvious non-loading runtime snapshots', () => {
    const result = runRuntimeSmokeTest(
      Object.fromEntries(BROKEN_RUNTIME_OUTPUT.files.map((file) => [file.path, file.content])),
    );

    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.type)).toEqual(
      expect.arrayContaining(['missing_entry_render', 'missing_default_export', 'obvious_runtime_throw']),
    );
  });
});

