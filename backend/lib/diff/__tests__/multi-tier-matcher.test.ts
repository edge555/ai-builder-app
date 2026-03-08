import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applySearchReplace } from '../multi-tier-matcher';

// Mock logger
vi.mock('../../logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('applySearchReplace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('happy path', () => {
    it('should replace exact match', () => {
      const content = 'export const foo = "bar";';
      const search = 'export const foo = "bar";';
      const replace = 'export const foo = "modified";';
      const occurrence = 1;

      const result = applySearchReplace(content, search, replace, occurrence);

      expect(result.success).toBe(true);
      expect(result.content).toBe('export const foo = "modified";');
    });

    it('should replace second occurrence', () => {
      const content = 'foo\nfoo\nfoo';
      const search = 'foo';
      const replace = 'bar';
      const occurrence = 2;

      const result = applySearchReplace(content, search, replace, occurrence);

      expect(result.success).toBe(true);
      expect(result.content).toBe('bar\nbar\nbar');
    });

    it('should replace all occurrences', () => {
      const content = 'foo\nfoo\nfoo';
      const search = 'foo';
      const replace = 'bar';
      const occurrence = 0;

      const result = applySearchReplace(content, search, replace, occurrence);

      expect(result.success).toBe(true);
      expect(result.content).toBe('bar\nbar\nbar');
    });
  });

  describe('edge cases', () => {
    it('should handle search string not found', () => {
      const content = 'export const foo = "bar";';
      const search = 'nonexistent';
      const replace = 'modified';
      const occurrence = 1;

      const result = applySearchReplace(content, search, replace, occurrence);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Search string not found');
    });

    it('should handle empty content', () => {
      const content = '';
      const search = 'foo';
      const replace = 'bar';
      const occurrence = 1;

      const result = applySearchReplace(content, search, replace, occurrence);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Content is empty');
    });

    it('should handle occurrence out of range', () => {
      const content = 'foo\nfoo\nfoo';
      const search = 'foo';
      const replace = 'bar';
      const occurrence = 5;

      const result = applySearchReplace(content, search, replace, occurrence);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Occurrence 5 out of range');
    });
  });

  describe('return value shape', () => {
    it('should return object with success boolean', () => {
      const content = 'export const foo = "bar";';
      const search = 'foo';
      const replace = 'bar';
      const occurrence = 1;

      const result = applySearchReplace(content, search, replace, occurrence);

      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
    });

    it('should return content string when successful', () => {
      const content = 'export const foo = "bar";';
      const search = 'foo';
      const replace = 'bar';
      const occurrence = 1;

      const result = applySearchReplace(content, search, replace, occurrence);

      expect(result).toHaveProperty('content');
      expect(typeof result.content).toBe('string');
    });

    it('should return error string when failed', () => {
      const content = 'export const foo = "bar";';
      const search = 'nonexistent';
      const replace = 'modified';
      const occurrence = 1;

      const result = applySearchReplace(content, search, replace, occurrence);

      expect(result).toHaveProperty('error');
      expect(typeof result.error).toBe('string');
    });
  });

  describe('side effects', () => {
    it('should not mutate input content', () => {
      const content = 'export const foo = "bar";';
      const search = 'foo';
      const replace = 'bar';
      const occurrence = 1;
      const contentCopy = content;

      applySearchReplace(content, search, replace, occurrence);

      expect(content).toEqual(contentCopy);
    });

    it('should not mutate input search string', () => {
      const content = 'export const foo = "bar";';
      const search = 'foo';
      const replace = 'bar';
      const occurrence = 1;
      const searchCopy = search;

      applySearchReplace(content, search, replace, occurrence);

      expect(search).toEqual(searchCopy);
    });

    it('should not mutate input replace string', () => {
      const content = 'export const foo = "bar";';
      const search = 'foo';
      const replace = 'bar';
      const occurrence = 1;
      const replaceCopy = replace;

      applySearchReplace(content, search, replace, occurrence);

      expect(replace).toEqual(replaceCopy);
    });
  });
});
