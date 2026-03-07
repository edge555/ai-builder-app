/**
 * Tests for diff-computer module
 * Following industry best practices: AAA pattern, clear descriptions, edge cases
 */

import { describe, it, expect } from 'vitest';
import { computeDiffs, createModifiedFileDiff } from '../diff-computer';

describe('diff-computer', () => {
  describe('computeDiffs', () => {
    it('should compute diffs for added files', () => {
      // Arrange
      const oldFiles: Record<string, string> = {};
      const newFiles: Record<string, string> = {
        'new.ts': 'export const x = 1;',
      };
      const deletedFiles: string[] = [];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);

      // Assert
      expect(diffs).toHaveLength(1);
      expect(diffs[0].filePath).toBe('new.ts');
      expect(diffs[0].status).toBe('added');
    });

    it('should compute diffs for modified files', () => {
      // Arrange
      const oldFiles: Record<string, string> = {
        'test.ts': 'export const x = 1;',
      };
      const newFiles: Record<string, string> = {
        'test.ts': 'export const x = 2;',
      };
      const deletedFiles: string[] = [];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);

      // Assert
      expect(diffs).toHaveLength(1);
      expect(diffs[0].filePath).toBe('test.ts');
      expect(diffs[0].status).toBe('modified');
    });

    it('should compute diffs for deleted files', () => {
      // Arrange
      const oldFiles: Record<string, string> = {
        'old.ts': 'export const x = 1;',
      };
      const newFiles: Record<string, string> = {};
      const deletedFiles: string[] = ['old.ts'];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);

      // Assert
      expect(diffs).toHaveLength(1);
      expect(diffs[0].filePath).toBe('old.ts');
      expect(diffs[0].status).toBe('deleted');
    });

    it('should handle mixed changes', () => {
      // Arrange
      const oldFiles: Record<string, string> = {
        'modified.ts': 'old content',
        'deleted.ts': 'to be deleted',
      };
      const newFiles: Record<string, string> = {
        'modified.ts': 'new content',
        'added.ts': 'new file',
      };
      const deletedFiles: string[] = ['deleted.ts'];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);

      // Assert
      expect(diffs).toHaveLength(3);
      const statuses = diffs.map(d => d.status);
      expect(statuses).toContain('added');
      expect(statuses).toContain('modified');
      expect(statuses).toContain('deleted');
    });

    it('should ignore whitespace-only changes', () => {
      // Arrange
      const oldFiles: Record<string, string> = {
        'test.ts': 'export const x = 1;',
      };
      const newFiles: Record<string, string> = {
        'test.ts': 'export const x = 1;  ', // trailing space
      };
      const deletedFiles: string[] = [];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);

      // Assert
      expect(diffs).toHaveLength(0);
    });

    it('should handle empty old files', () => {
      // Arrange
      const oldFiles: Record<string, string> = {};
      const newFiles: Record<string, string> = {
        'new.ts': 'content',
      };
      const deletedFiles: string[] = [];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);

      // Assert
      expect(diffs).toHaveLength(1);
      expect(diffs[0].status).toBe('added');
    });

    it('should handle empty new files', () => {
      // Arrange
      const oldFiles: Record<string, string> = {
        'old.ts': 'content',
      };
      const newFiles: Record<string, string> = {};
      const deletedFiles: string[] = ['old.ts'];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);

      // Assert
      expect(diffs).toHaveLength(1);
      expect(diffs[0].status).toBe('deleted');
    });

    it('should handle multiple files efficiently', () => {
      // Arrange
      const oldFiles: Record<string, string> = {};
      const newFiles: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        newFiles[`file${i}.ts`] = `export const file${i} = ${i};`;
      }
      const deletedFiles: string[] = [];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);

      // Assert
      expect(diffs).toHaveLength(100);
      diffs.forEach(diff => {
        expect(diff.status).toBe('added');
      });
    });

    it('should handle files with special characters in paths', () => {
      // Arrange
      const oldFiles: Record<string, string> = {};
      const newFiles: Record<string, string> = {
        'file with spaces.ts': 'content',
        'file-with-dashes.ts': 'content',
        'file_with_underscores.ts': 'content',
      };
      const deletedFiles: string[] = [];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);

      // Assert
      expect(diffs).toHaveLength(3);
    });

    it('should handle nested directory structures', () => {
      // Arrange
      const oldFiles: Record<string, string> = {};
      const newFiles: Record<string, string> = {
        'src/components/Button.tsx': 'button',
        'src/utils/helpers.ts': 'helpers',
        'src/api/routes.ts': 'routes',
      };
      const deletedFiles: string[] = [];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);

      // Assert
      expect(diffs).toHaveLength(3);
      expect(diffs[0].filePath).toContain('/');
    });

    it('should handle empty file content', () => {
      // Arrange
      const oldFiles: Record<string, string> = {
        'empty.ts': '',
      };
      const newFiles: Record<string, string> = {
        'empty.ts': 'new content',
      };
      const deletedFiles: string[] = [];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);

      // Assert
      expect(diffs).toHaveLength(1);
      expect(diffs[0].status).toBe('modified');
    });

    it('should handle files with unicode content', () => {
      // Arrange
      const oldFiles: Record<string, string> = {
        'unicode.ts': 'const x = "Hello 世界";',
      };
      const newFiles: Record<string, string> = {
        'unicode.ts': 'const x = "Hello 世界 🌍";',
      };
      const deletedFiles: string[] = [];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);

      // Assert
      expect(diffs).toHaveLength(1);
      expect(diffs[0].status).toBe('modified');
    });

    it('should handle files with tabs', () => {
      // Arrange
      const oldFiles: Record<string, string> = {
        'tabs.ts': '\tconst x = 1;',
      };
      const newFiles: Record<string, string> = {
        'tabs.ts': '\tconst x = 2;',
      };
      const deletedFiles: string[] = [];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);

      // Assert
      expect(diffs).toHaveLength(1);
      expect(diffs[0].status).toBe('modified');
    });

    it('should handle files with multiline content', () => {
      // Arrange
      const oldFiles: Record<string, string> = {
        'multiline.ts': 'line1\nline2\nline3',
      };
      const newFiles: Record<string, string> = {
        'multiline.ts': 'line1\nline2\nline3\nline4',
      };
      const deletedFiles: string[] = [];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);

      // Assert
      expect(diffs).toHaveLength(1);
      expect(diffs[0].status).toBe('modified');
    });
  });

  describe('createModifiedFileDiff', () => {
    it('should create diff for modified file', () => {
      // Arrange
      const filePath = 'test.ts';
      const oldContent = 'old content';
      const newContent = 'new content';

      // Act
      const diff = createModifiedFileDiff(filePath, oldContent, newContent);

      // Assert
      expect(diff.filePath).toBe(filePath);
      expect(diff.status).toBe('modified');
      expect(diff.hunks).toBeDefined();
    });

    it('should detect changes in modified file', () => {
      // Arrange
      const filePath = 'test.ts';
      const oldContent = 'const x = 1;';
      const newContent = 'const x = 2;';

      // Act
      const diff = createModifiedFileDiff(filePath, oldContent, newContent);

      // Assert
      expect(diff.hunks.length).toBeGreaterThan(0);
    });

    it('should handle identical content', () => {
      // Arrange
      const filePath = 'test.ts';
      const content = 'same content';

      // Act
      const diff = createModifiedFileDiff(filePath, content, content);

      // Assert
      expect(diff.filePath).toBe(filePath);
      expect(diff.status).toBe('modified');
    });
  });
});
