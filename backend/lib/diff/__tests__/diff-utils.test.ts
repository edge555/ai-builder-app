/**
 * Tests for diff-utils module
 * Following industry best practices: AAA pattern, clear descriptions, edge cases
 */

import { describe, it, expect } from 'vitest';
import { computeDiffs, createModifiedFileDiff } from '../diff-computer';
import { createChangeSummary } from '../change-summarizer';

describe('diff-utils integration', () => {
  describe('combined diff operations', () => {
    it('should compute diffs and create summary', () => {
      // Arrange
      const oldFiles: Record<string, string> = {
        'test.ts': 'old content',
      };
      const newFiles: Record<string, string> = {
        'test.ts': 'new content',
      };
      const deletedFiles: string[] = [];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);
      const summary = createChangeSummary(diffs, 'Test modification');

      // Assert
      expect(diffs).toHaveLength(1);
      expect(summary.filesModified).toBe(1);
    });

    it('should handle added files with summary', () => {
      // Arrange
      const oldFiles: Record<string, string> = {};
      const newFiles: Record<string, string> = {
        'new.ts': 'new content',
      };
      const deletedFiles: string[] = [];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);
      const summary = createChangeSummary(diffs, 'Add file');

      // Assert
      expect(summary.filesAdded).toBe(1);
      expect(summary.affectedFiles).toContain('new.ts');
    });

    it('should handle deleted files with summary', () => {
      // Arrange
      const oldFiles: Record<string, string> = {
        'old.ts': 'old content',
      };
      const newFiles: Record<string, string> = {};
      const deletedFiles: string[] = ['old.ts'];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);
      const summary = createChangeSummary(diffs, 'Delete file');

      // Assert
      expect(summary.filesDeleted).toBe(1);
      expect(summary.affectedFiles).toContain('old.ts');
    });

    it('should handle mixed changes with summary', () => {
      // Arrange
      const oldFiles: Record<string, string> = {
        'modified.ts': 'old',
        'deleted.ts': 'to delete',
      };
      const newFiles: Record<string, string> = {
        'modified.ts': 'new',
        'added.ts': 'new file',
      };
      const deletedFiles: string[] = ['deleted.ts'];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);
      const summary = createChangeSummary(diffs, 'Mixed changes');

      // Assert
      expect(summary.filesAdded).toBe(1);
      expect(summary.filesModified).toBe(1);
      expect(summary.filesDeleted).toBe(1);
    });

    it('should handle empty changes with summary', () => {
      // Arrange
      const oldFiles: Record<string, string> = {};
      const newFiles: Record<string, string> = {};
      const deletedFiles: string[] = [];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);
      const summary = createChangeSummary(diffs, 'No changes');

      // Assert
      expect(diffs).toHaveLength(0);
      expect(summary.filesAdded).toBe(0);
      expect(summary.filesModified).toBe(0);
      expect(summary.filesDeleted).toBe(0);
    });

    it('should create proper description in summary', () => {
      // Arrange
      const oldFiles: Record<string, string> = {};
      const newFiles: Record<string, string> = {
        'file1.ts': 'content1',
        'file2.ts': 'content2',
      };
      const deletedFiles: string[] = [];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);
      const summary = createChangeSummary(diffs, 'Add files');

      // Assert
      expect(summary.description).toContain('2 files added');
    });

    it('should handle files with special characters', () => {
      // Arrange
      const oldFiles: Record<string, string> = {};
      const newFiles: Record<string, string> = {
        'file with spaces.ts': 'content',
        'file-with-dashes.ts': 'content',
      };
      const deletedFiles: string[] = [];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);
      const summary = createChangeSummary(diffs, 'Special chars');

      // Assert
      expect(diffs).toHaveLength(2);
      expect(summary.affectedFiles).toHaveLength(2);
    });

    it('should handle nested directory structures', () => {
      // Arrange
      const oldFiles: Record<string, string> = {};
      const newFiles: Record<string, string> = {
        'src/components/Button.tsx': 'button',
        'src/utils/helpers.ts': 'helpers',
      };
      const deletedFiles: string[] = [];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);
      const summary = createChangeSummary(diffs, 'Nested dirs');

      // Assert
      expect(diffs).toHaveLength(2);
      expect(summary.affectedFiles[0]).toContain('/');
    });

    it('should handle large number of files', () => {
      // Arrange
      const oldFiles: Record<string, string> = {};
      const newFiles: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        newFiles[`file${i}.ts`] = `content${i}`;
      }
      const deletedFiles: string[] = [];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);
      const summary = createChangeSummary(diffs, 'Many files');

      // Assert
      expect(diffs).toHaveLength(100);
      expect(summary.filesAdded).toBe(100);
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
      const summary = createChangeSummary(diffs, 'Unicode content');

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
      const summary = createChangeSummary(diffs, 'Tabs');

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
      const summary = createChangeSummary(diffs, 'Multiline');

      // Assert
      expect(diffs).toHaveLength(1);
      expect(diffs[0].status).toBe('modified');
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
      const summary = createChangeSummary(diffs, 'Empty to content');

      // Assert
      expect(diffs).toHaveLength(1);
      expect(diffs[0].status).toBe('modified');
    });

    it('should handle identical content', () => {
      // Arrange
      const content = 'same content';
      const oldFiles: Record<string, string> = {
        'same.ts': content,
      };
      const newFiles: Record<string, string> = {
        'same.ts': content,
      };
      const deletedFiles: string[] = [];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);
      const summary = createChangeSummary(diffs, 'Identical');

      // Assert
      expect(diffs).toHaveLength(0);
      expect(summary.filesModified).toBe(0);
    });

    it('should handle whitespace-only changes', () => {
      // Arrange
      const oldFiles: Record<string, string> = {
        'whitespace.ts': 'const x = 1;',
      };
      const newFiles: Record<string, string> = {
        'whitespace.ts': 'const x = 1;  ', // trailing space
      };
      const deletedFiles: string[] = [];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);
      const summary = createChangeSummary(diffs, 'Whitespace');

      // Assert
      expect(diffs).toHaveLength(0);
      expect(summary.filesModified).toBe(0);
    });

    it('should include line counts in summary', () => {
      // Arrange
      const oldFiles: Record<string, string> = {
        'test.ts': 'line1\nline2',
      };
      const newFiles: Record<string, string> = {
        'test.ts': 'line1\nline2\nline3',
      };
      const deletedFiles: string[] = [];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);
      const summary = createChangeSummary(diffs, 'Line counts');

      // Assert
      expect(summary.linesAdded).toBeGreaterThan(0);
      expect(summary.description).toContain('lines added');
    });

    it('should handle multiple file types in summary', () => {
      // Arrange
      const oldFiles: Record<string, string> = {
        'modified.ts': 'old',
      };
      const newFiles: Record<string, string> = {
        'modified.ts': 'new',
        'added.ts': 'new',
      };
      const deletedFiles: string[] = ['deleted.ts'];

      // Act
      const diffs = computeDiffs(oldFiles, newFiles, deletedFiles);
      const summary = createChangeSummary(diffs, 'Multiple types');

      // Assert
      expect(summary.description).toContain('1 file added');
      expect(summary.description).toContain('1 file modified');
      expect(summary.description).toContain('1 file deleted');
    });
  });
});
