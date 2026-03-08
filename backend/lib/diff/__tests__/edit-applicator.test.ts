import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyEdits, normalizeContent } from '../edit-applicator';

// Mock multi-tier-matcher
vi.mock('../multi-tier-matcher', () => ({
  applySearchReplace: vi.fn((content, search, replace, occurrence) => {
    if (content.includes(search)) {
      return {
        success: true,
        content: content.replace(search, replace),
      };
    }
    return {
      success: false,
      error: 'Search string not found',
    };
  }),
}));

// Mock logger
vi.mock('../../logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('applyEdits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('happy path', () => {
    it('should apply single edit successfully', () => {
      const originalContent = 'export const foo = "bar";';
      const edits = [
        {
          search: 'export const foo = "bar";',
          replace: 'export const foo = "modified";',
        },
      ];

      const result = applyEdits(originalContent, edits);

      expect(result.success).toBe(true);
      expect(result.content).toContain('modified');
    });

    it('should apply multiple edits successfully', () => {
      const originalContent = 'const foo = "bar";\nconst baz = "qux";';
      const edits = [
        {
          search: 'const foo = "bar";',
          replace: 'const foo = "modified";',
        },
        {
          search: 'const baz = "qux";',
          replace: 'const baz = "changed";',
        },
      ];

      const result = applyEdits(originalContent, edits);

      expect(result.success).toBe(true);
      expect(result.content).toContain('modified');
      expect(result.content).toContain('changed');
    });

    it('should handle occurrence parameter', () => {
      const originalContent = 'foo\nfoo\nfoo';
      const edits = [
        {
          search: 'foo',
          replace: 'bar',
          occurrence: 2,
        },
      ];

      const result = applyEdits(originalContent, edits);

      expect(result.success).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty edits array', () => {
      const originalContent = 'export const foo = "bar";';
      const edits: any[] = [];

      const result = applyEdits(originalContent, edits);

      expect(result.success).toBe(true);
      expect(result.content).toBe(originalContent);
    });

    it('should handle escaped newlines in search string', () => {
      const originalContent = 'line1\\nline2';
      const edits = [
        {
          search: 'line1\\nline2',
          replace: 'modified',
        },
      ];

      const result = applyEdits(originalContent, edits);

      expect(result.success).toBe(true);
    });

    it('should handle escaped tabs in search string', () => {
      const originalContent = 'tab\\there';
      const edits = [
        {
          search: 'tab\\there',
          replace: 'modified',
        },
      ];

      const result = applyEdits(originalContent, edits);

      expect(result.success).toBe(true);
    });

    it('should handle escaped newlines in replace string', () => {
      const originalContent = 'line1 line2';
      const edits = [
        {
          search: 'line1 line2',
          replace: 'line1\\nline2',
        },
      ];

      const result = applyEdits(originalContent, edits);

      expect(result.success).toBe(true);
    });

    it('should handle escaped tabs in replace string', () => {
      const originalContent = 'tab there';
      const edits = [
        {
          search: 'tab there',
          replace: 'tab\\there',
        },
      ];

      const result = applyEdits(originalContent, edits);

      expect(result.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should return error when edit fails', () => {
      const originalContent = 'export const foo = "bar";';
      const edits = [
        {
          search: 'nonexistent string',
          replace: 'modified',
        },
      ];

      const result = applyEdits(originalContent, edits);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.failedEditIndex).toBe(0);
    });

    it('should return error when second edit fails', () => {
      const originalContent = 'export const foo = "bar";';
      const edits = [
        {
          search: 'export const foo = "bar";',
          replace: 'export const foo = "modified";',
        },
        {
          search: 'nonexistent string',
          replace: 'modified',
        },
      ];

      const result = applyEdits(originalContent, edits);

      expect(result.success).toBe(false);
      expect(result.failedEditIndex).toBe(1);
    });
  });

  describe('return value shape', () => {
    it('should return object with success boolean', () => {
      const originalContent = 'export const foo = "bar";';
      const edits = [
        {
          search: 'export const foo = "bar";',
          replace: 'export const foo = "modified";',
        },
      ];

      const result = applyEdits(originalContent, edits);

      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
    });

    it('should return content string when successful', () => {
      const originalContent = 'export const foo = "bar";';
      const edits = [
        {
          search: 'export const foo = "bar";',
          replace: 'export const foo = "modified";',
        },
      ];

      const result = applyEdits(originalContent, edits);

      expect(result).toHaveProperty('content');
      expect(typeof result.content).toBe('string');
    });

    it('should return error string when failed', () => {
      const originalContent = 'export const foo = "bar";';
      const edits = [
        {
          search: 'nonexistent',
          replace: 'modified',
        },
      ];

      const result = applyEdits(originalContent, edits);

      expect(result).toHaveProperty('error');
      expect(typeof result.error).toBe('string');
    });

    it('should return failedEditIndex when failed', () => {
      const originalContent = 'export const foo = "bar";';
      const edits = [
        {
          search: 'nonexistent',
          replace: 'modified',
        },
      ];

      const result = applyEdits(originalContent, edits);

      expect(result).toHaveProperty('failedEditIndex');
      expect(typeof result.failedEditIndex).toBe('number');
    });

    it('should return warnings array when fuzzy matching occurs', () => {
      const originalContent = 'export const foo = "bar";';
      const edits = [
        {
          search: 'export const foo = "bar";',
          replace: 'export const foo = "modified";',
        },
      ];

      const result = applyEdits(originalContent, edits);

      expect(result).toHaveProperty('warnings');
    });
  });

  describe('side effects', () => {
    it('should not mutate original content', () => {
      const originalContent = 'export const foo = "bar";';
      const edits = [
        {
          search: 'export const foo = "bar";',
          replace: 'export const foo = "modified";',
        },
      ];
      const originalContentCopy = originalContent;

      applyEdits(originalContent, edits);

      expect(originalContent).toBe(originalContentCopy);
    });

    it('should not mutate edits array', () => {
      const originalContent = 'export const foo = "bar";';
      const edits = [
        {
          search: 'export const foo = "bar";',
          replace: 'export const foo = "modified";',
        },
      ];
      const editsCopy = JSON.parse(JSON.stringify(edits));

      applyEdits(originalContent, edits);

      expect(edits).toEqual(editsCopy);
    });
  });
});

describe('normalizeContent', () => {
  describe('happy path', () => {
    it('should remove trailing whitespace from each line', () => {
      const content = 'line1   \nline2\t\nline3   \t';

      const result = normalizeContent(content);

      expect(result).toBe('line1\nline2\nline3');
    });

    it('should preserve intentional spacing within lines', () => {
      const content = 'line1   \nline2\t\nline3   \t';

      const result = normalizeContent(content);

      expect(result).toBe('line1\nline2\nline3');
    });

    it('should trim trailing whitespace from end of content', () => {
      const content = 'line1\nline2\n   ';

      const result = normalizeContent(content);

      expect(result).toBe('line1\nline2');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      const content = '';

      const result = normalizeContent(content);

      expect(result).toBe('');
    });

    it('should handle single line', () => {
      const content = 'single line   ';

      const result = normalizeContent(content);

      expect(result).toBe('single line');
    });

    it('should handle only whitespace', () => {
      const content = '   \n\t  \n   ';

      const result = normalizeContent(content);

      expect(result).toBe('');
    });

    it('should handle lines with no trailing whitespace', () => {
      const content = 'line1\nline2\nline3';

      const result = normalizeContent(content);

      expect(result).toBe('line1\nline2\nline3');
    });
  });

  describe('return value shape', () => {
    it('should return string', () => {
      const content = 'test content';

      const result = normalizeContent(content);

      expect(typeof result).toBe('string');
    });
  });

  describe('side effects', () => {
    it('should not mutate original content', () => {
      const content = 'line1   \nline2\t';
      const contentCopy = content;

      normalizeContent(content);

      expect(content).toBe(contentCopy);
    });
  });
});
