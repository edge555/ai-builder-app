import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateDiffSize } from '../diff-size-guard';

// Mock logger
vi.mock('../../logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('evaluateDiffSize', () => {
  describe('non-modify operations', () => {
    it('should return ok for create operations', () => {
      const result = evaluateDiffSize('', 'new content', 'create');
      expect(result.verdict).toBe('ok');
      expect(result.changeRatio).toBe(0);
    });

    it('should return ok for replace_file operations', () => {
      const result = evaluateDiffSize('old', 'completely different', 'replace_file');
      expect(result.verdict).toBe('ok');
    });

    it('should return ok for delete operations', () => {
      const result = evaluateDiffSize('old content', '', 'delete');
      expect(result.verdict).toBe('ok');
    });
  });

  describe('modify operations', () => {
    it('should return ok when changeRatio <= 0.5', () => {
      // 10 lines, change 5 of them = 0.5
      const original = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
      const modified = Array.from({ length: 10 }, (_, i) =>
        i < 5 ? `changed ${i}` : `line ${i}`
      ).join('\n');

      const result = evaluateDiffSize(original, modified, 'modify');
      expect(result.verdict).toBe('ok');
      expect(result.changeRatio).toBe(0.5);
    });

    it('should return suspicious when changeRatio is ~0.7', () => {
      // 10 lines, change 7 of them = 0.7
      const original = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
      const modified = Array.from({ length: 10 }, (_, i) =>
        i < 7 ? `changed ${i}` : `line ${i}`
      ).join('\n');

      const result = evaluateDiffSize(original, modified, 'modify');
      expect(result.verdict).toBe('suspicious');
      expect(result.changeRatio).toBe(0.7);
      expect(result.reason).toContain('70%');
    });

    it('should return converted when changeRatio is ~0.95', () => {
      // 20 lines, change 19 of them = 0.95
      const original = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
      const modified = Array.from({ length: 20 }, (_, i) =>
        i < 19 ? `changed ${i}` : `line ${i}`
      ).join('\n');

      const result = evaluateDiffSize(original, modified, 'modify');
      expect(result.verdict).toBe('converted');
      expect(result.changeRatio).toBe(0.95);
      expect(result.reason).toContain('replace_file');
    });

    it('should auto-convert modify to replace_file at 0.95', () => {
      const original = Array.from({ length: 100 }, (_, i) => `original line ${i}`).join('\n');
      const modified = Array.from({ length: 100 }, (_, i) =>
        i < 95 ? `totally different ${i}` : `original line ${i}`
      ).join('\n');

      const result = evaluateDiffSize(original, modified, 'modify');
      expect(result.verdict).toBe('converted');
      expect(result.linesChanged).toBe(95);
      expect(result.totalLines).toBe(100);
    });

    it('should handle empty original content', () => {
      const result = evaluateDiffSize('', 'new line\nanother line', 'modify');
      expect(result.verdict).toBe('converted'); // 100% change
      expect(result.changeRatio).toBe(1);
    });

    it('should handle identical content', () => {
      const content = 'line 1\nline 2\nline 3';
      const result = evaluateDiffSize(content, content, 'modify');
      expect(result.verdict).toBe('ok');
      expect(result.changeRatio).toBe(0);
      expect(result.linesChanged).toBe(0);
    });

    it('should handle content with different line counts', () => {
      const original = 'line 1\nline 2';
      const modified = 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6';

      const result = evaluateDiffSize(original, modified, 'modify');
      // 6 total lines (max), 4 lines differ (3,4,5,6 are new)
      expect(result.totalLines).toBe(6);
      expect(result.linesChanged).toBe(4);
    });
  });
});
