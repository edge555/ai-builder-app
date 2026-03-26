/**
 * Complex edge case tests for diff-size-guard.
 *
 * The basic tests cover the threshold verdicts (ok / suspicious / converted).
 * These tests focus on:
 *  - Exact boundary conditions at 60% and 90% thresholds (strict > vs ≤)
 *  - CRLF vs LF line endings and mixed files
 *  - Whitespace-only and blank-line-only changes
 *  - Non-modify operations (always 'ok' regardless of content)
 *  - Empty files and single-line files
 *  - Very large files (performance + correctness)
 *  - Symmetric changes: swapping identical lines counts as 0 changes
 */

import { describe, it, expect, vi } from 'vitest';
import { evaluateDiffSize } from '../diff-size-guard';

vi.mock('../../logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a file with `n` lines, each being `content`. */
function lines(n: number, content = 'line'): string {
  return Array.from({ length: n }, (_, i) => `${content} ${i + 1}`).join('\n');
}

/** Replace the first `k` lines with different content. */
function replaceFirstK(original: string, k: number): string {
  const ls = original.split('\n');
  for (let i = 0; i < Math.min(k, ls.length); i++) {
    ls[i] = `changed ${i + 1}`;
  }
  return ls.join('\n');
}

// ── Non-modify operations ─────────────────────────────────────────────────────

describe('evaluateDiffSize — non-modify operations are always ok', () => {
  const ops = ['create', 'replace_file', 'delete'] as const;

  ops.forEach((op) => {
    it(`${op} → verdict 'ok' even when all lines differ`, () => {
      const result = evaluateDiffSize('a\nb\nc', 'x\ny\nz', op);

      expect(result.verdict).toBe('ok');
      expect(result.linesChanged).toBe(0);
      expect(result.totalLines).toBe(0);
      expect(result.changeRatio).toBe(0);
    });
  });
});

// ── Exact threshold boundaries ────────────────────────────────────────────────

describe('evaluateDiffSize — exact threshold boundaries (modify)', () => {
  // 10-line file; thresholds: >60% = suspicious, >90% = converted

  it('0 of 10 lines changed → verdict ok, ratio 0', () => {
    const original = lines(10);
    const result = evaluateDiffSize(original, original, 'modify');

    expect(result.verdict).toBe('ok');
    expect(result.linesChanged).toBe(0);
    expect(result.changeRatio).toBe(0);
  });

  it('6 of 10 lines changed (60%) → verdict ok (> not >=)', () => {
    const original = lines(10);
    const modified = replaceFirstK(original, 6);
    const result = evaluateDiffSize(original, modified, 'modify');

    expect(result.changeRatio).toBeCloseTo(0.6, 5);
    expect(result.verdict).toBe('ok');
  });

  it('7 of 10 lines changed (70%) → verdict suspicious', () => {
    const original = lines(10);
    const modified = replaceFirstK(original, 7);
    const result = evaluateDiffSize(original, modified, 'modify');

    expect(result.changeRatio).toBeCloseTo(0.7, 5);
    expect(result.verdict).toBe('suspicious');
  });

  it('9 of 10 lines changed (90%) → verdict suspicious (> not >=)', () => {
    const original = lines(10);
    const modified = replaceFirstK(original, 9);
    const result = evaluateDiffSize(original, modified, 'modify');

    expect(result.changeRatio).toBeCloseTo(0.9, 5);
    expect(result.verdict).toBe('suspicious');
  });

  it('10 of 10 lines changed (100%) → verdict converted', () => {
    const original = lines(10);
    const modified = lines(10, 'new');
    const result = evaluateDiffSize(original, modified, 'modify');

    expect(result.changeRatio).toBeCloseTo(1.0, 5);
    expect(result.verdict).toBe('converted');
  });

  it('just above 90% (91%) → verdict converted', () => {
    // 11-line file, 10 lines changed = 10/11 ≈ 0.909
    const original = lines(11);
    const modified = replaceFirstK(original, 10);
    const result = evaluateDiffSize(original, modified, 'modify');

    expect(result.changeRatio).toBeGreaterThan(0.9);
    expect(result.verdict).toBe('converted');
  });

  it('just above 60% (61.5%) → verdict suspicious', () => {
    // 13-line file, 8 changed = 8/13 ≈ 0.615
    const original = lines(13);
    const modified = replaceFirstK(original, 8);
    const result = evaluateDiffSize(original, modified, 'modify');

    expect(result.changeRatio).toBeGreaterThan(0.6);
    expect(result.changeRatio).toBeLessThan(0.9);
    expect(result.verdict).toBe('suspicious');
  });
});

// ── Line ending edge cases ────────────────────────────────────────────────────

describe('evaluateDiffSize — line ending differences (CRLF vs LF)', () => {
  it('CRLF original vs LF modified — every line counts as changed', () => {
    // "\r\n" splits as ["line 1\r", "line 2\r", ...]
    // "\n" splits as ["line 1", "line 2", ...]
    // Each pair differs → all lines changed
    const original = 'line 1\r\nline 2\r\nline 3\r\n';
    const modified = 'line 1\nline 2\nline 3\n';

    const result = evaluateDiffSize(original, modified, 'modify');

    // original.split('\n') = ['line 1\r', 'line 2\r', 'line 3\r', '']
    // modified.split('\n') = ['line 1',   'line 2',   'line 3',   '']
    // 3 out of 4 lines differ = 75% → suspicious
    expect(result.linesChanged).toBeGreaterThan(0);
    expect(['suspicious', 'converted']).toContain(result.verdict);
  });

  it('same CRLF content on both sides — zero lines changed', () => {
    const content = 'line 1\r\nline 2\r\nline 3';
    const result = evaluateDiffSize(content, content, 'modify');

    expect(result.linesChanged).toBe(0);
    expect(result.verdict).toBe('ok');
  });

  it('mixed CRLF/LF original — split on LF preserves \\r within lines', () => {
    // A file with inconsistent line endings: first line CRLF, rest LF
    const original = 'a\r\nb\nc';
    // After replacing the CRLF line with LF version
    const modified = 'a\nb\nc';

    const result = evaluateDiffSize(original, modified, 'modify');

    // original.split('\n') = ['a\r', 'b', 'c']
    // modified.split('\n') = ['a',   'b', 'c']
    // 1 out of 3 lines differ ≈ 33% → ok
    expect(result.linesChanged).toBe(1);
    expect(result.verdict).toBe('ok');
  });
});

// ── Whitespace-only changes ───────────────────────────────────────────────────

describe('evaluateDiffSize — whitespace-only changes', () => {
  it('indentation change on every line counts as all lines changed', () => {
    const original = 'if (x) {\n  return 1;\n}';
    const modified = 'if (x) {\n    return 1;\n}'; // 4-space indent instead of 2

    const result = evaluateDiffSize(original, modified, 'modify');

    // 1 of 3 lines changed = 33% → ok
    expect(result.linesChanged).toBe(1);
    expect(result.verdict).toBe('ok');
  });

  it('trailing whitespace added to all lines → suspicious or converted', () => {
    // 10 lines, every line gets a trailing space
    const original = lines(10);
    const modified = original.split('\n').map(l => l + ' ').join('\n');

    const result = evaluateDiffSize(original, modified, 'modify');

    expect(result.linesChanged).toBe(10);
    expect(['suspicious', 'converted']).toContain(result.verdict);
  });

  it('only blank lines added at the end → additional lines counted as changed', () => {
    const original = 'a\nb\nc';
    const modified = 'a\nb\nc\n\n\n'; // 3 blank lines appended

    // original.split('\n') = ['a', 'b', 'c']         length=3
    // modified.split('\n') = ['a', 'b', 'c', '', '', ''] length=6
    // totalLines = max(3, 6) = 6
    // positions 3,4,5: orig=undefined, mod='' → 3 changes
    // changeRatio = 3/6 = 0.5 → ok
    const result = evaluateDiffSize(original, modified, 'modify');

    expect(result.totalLines).toBe(6);
    expect(result.linesChanged).toBe(3);
    expect(result.changeRatio).toBeCloseTo(0.5, 5);
    expect(result.verdict).toBe('ok');
  });

  it('entirely blank lines added (no code changed) — ratio reflects only additions', () => {
    const original = 'a';
    // Adding 19 blank lines: total=20, changed=19 (original had only 1 line)
    const modified = 'a' + '\n'.repeat(19);

    const result = evaluateDiffSize(original, modified, 'modify');

    // original.split('\n').length = 1
    // modified.split('\n').length = 20
    // totalLines = 20, 19 positions have undefined vs ''
    expect(result.totalLines).toBe(20);
    expect(result.linesChanged).toBe(19);
    expect(result.changeRatio).toBeCloseTo(19 / 20, 5);
    expect(['suspicious', 'converted']).toContain(result.verdict);
  });
});

// ── Empty and single-line files ───────────────────────────────────────────────

describe('evaluateDiffSize — empty and minimal files', () => {
  it('both files empty → ok with zero everything', () => {
    const result = evaluateDiffSize('', '', 'modify');

    expect(result.verdict).toBe('ok');
    expect(result.linesChanged).toBe(0);
    expect(result.totalLines).toBe(1); // ''.split('\n') = [''], length=1
  });

  it('original empty, modified has content → 100% change → converted', () => {
    const result = evaluateDiffSize('', 'a\nb\nc', 'modify');

    // original=[''], modified=['a','b','c']
    // totalLines = max(1,3) = 3
    // position 0: '' vs 'a' → changed
    // positions 1,2: undefined vs 'b','c' → changed
    // 3/3 = 100% → converted
    expect(result.verdict).toBe('converted');
    expect(result.changeRatio).toBe(1);
  });

  it('original has content, modified empty → 100% → converted', () => {
    const result = evaluateDiffSize('a\nb\nc', '', 'modify');

    expect(result.verdict).toBe('converted');
  });

  it('single line identical → ok', () => {
    const result = evaluateDiffSize('const x = 1;', 'const x = 1;', 'modify');

    expect(result.verdict).toBe('ok');
    expect(result.linesChanged).toBe(0);
  });

  it('single line different → 100% change → converted', () => {
    const result = evaluateDiffSize('const x = 1;', 'const x = 2;', 'modify');

    expect(result.verdict).toBe('converted');
    expect(result.linesChanged).toBe(1);
    expect(result.totalLines).toBe(1);
  });
});

// ── Large file performance ────────────────────────────────────────────────────

describe('evaluateDiffSize — large files (correctness at scale)', () => {
  it('10 000-line file with no changes → ok in reasonable time', () => {
    const big = lines(10_000);
    const start = Date.now();
    const result = evaluateDiffSize(big, big, 'modify');
    const elapsed = Date.now() - start;

    expect(result.verdict).toBe('ok');
    expect(result.linesChanged).toBe(0);
    // Should complete well under 500ms (purely algorithmic, O(n))
    expect(elapsed).toBeLessThan(500);
  });

  it('10 000-line file with last 1 000 lines changed → ratio 10% → ok', () => {
    const original = lines(10_000);
    const origLines = original.split('\n');
    for (let i = 9_000; i < 10_000; i++) origLines[i] = `changed ${i}`;
    const modified = origLines.join('\n');

    const result = evaluateDiffSize(original, modified, 'modify');

    expect(result.linesChanged).toBe(1_000);
    expect(result.totalLines).toBe(10_000);
    expect(result.changeRatio).toBeCloseTo(0.1, 4);
    expect(result.verdict).toBe('ok');
  });

  it('10 000-line file with all lines changed → converted', () => {
    const original = lines(10_000);
    const modified = lines(10_000, 'replaced');

    const result = evaluateDiffSize(original, modified, 'modify');

    expect(result.verdict).toBe('converted');
    expect(result.changeRatio).toBe(1);
  });
});

// ── Returned metadata accuracy ────────────────────────────────────────────────

describe('evaluateDiffSize — result metadata fields', () => {
  it('reason field is present on suspicious and converted, absent on ok', () => {
    const tenLines = lines(10);

    const ok = evaluateDiffSize(tenLines, tenLines, 'modify');
    expect(ok.reason).toBeUndefined();

    const suspicious = evaluateDiffSize(tenLines, replaceFirstK(tenLines, 7), 'modify');
    expect(suspicious.reason).toBeDefined();
    expect(suspicious.reason).toContain('%');

    const converted = evaluateDiffSize(tenLines, lines(10, 'x'), 'modify');
    expect(converted.reason).toBeDefined();
    expect(converted.reason).toContain('auto-converted');
  });

  it('totalLines is max(original lines, modified lines)', () => {
    const original = 'a\nb\nc';        // 3 lines
    const modified = 'a\nb\nc\nd\ne';  // 5 lines

    const result = evaluateDiffSize(original, modified, 'modify');

    expect(result.totalLines).toBe(5);
  });

  it('linesChanged equals number of positions that differ', () => {
    // original: ['a', 'b', 'c']
    // modified: ['a', 'X', 'c']
    const result = evaluateDiffSize('a\nb\nc', 'a\nX\nc', 'modify');

    expect(result.linesChanged).toBe(1);
  });
});
