/**
 * Tests for change-summarizer module
 * Following industry best practices: AAA pattern, clear descriptions, edge cases
 */

import { describe, it, expect } from 'vitest';
import { createChangeSummary } from '../change-summarizer';
import type { FileDiff } from '@ai-app-builder/shared';

describe('change-summarizer', () => {
  describe('createChangeSummary', () => {
    it('should summarize single file addition', () => {
      // Arrange
      const diffs: FileDiff[] = [
        {
          filePath: 'src/new-file.ts',
          status: 'added',
          hunks: [],
        },
      ];

      // Act
      const summary = createChangeSummary(diffs, 'Add new file');

      // Assert
      expect(summary).toBeDefined();
      expect(summary.filesAdded).toBe(1);
      expect(summary.filesModified).toBe(0);
      expect(summary.filesDeleted).toBe(0);
      expect(summary.affectedFiles).toContain('src/new-file.ts');
    });

    it('should summarize single file modification', () => {
      // Arrange
      const diffs: FileDiff[] = [
        {
          filePath: 'src/existing.ts',
          status: 'modified',
          hunks: [],
        },
      ];

      // Act
      const summary = createChangeSummary(diffs, 'Modify file');

      // Assert
      expect(summary.filesAdded).toBe(0);
      expect(summary.filesModified).toBe(1);
      expect(summary.filesDeleted).toBe(0);
    });

    it('should summarize single file deletion', () => {
      // Arrange
      const diffs: FileDiff[] = [
        {
          filePath: 'src/old-file.ts',
          status: 'deleted',
          hunks: [],
        },
      ];

      // Act
      const summary = createChangeSummary(diffs, 'Delete file');

      // Assert
      expect(summary.filesAdded).toBe(0);
      expect(summary.filesModified).toBe(0);
      expect(summary.filesDeleted).toBe(1);
    });

    it('should summarize mixed changes correctly', () => {
      // Arrange
      const diffs: FileDiff[] = [
        { filePath: 'src/new.ts', status: 'added', hunks: [] },
        { filePath: 'src/exist.ts', status: 'modified', hunks: [] },
        { filePath: 'src/old.ts', status: 'deleted', hunks: [] },
        { filePath: 'src/another.ts', status: 'added', hunks: [] },
      ];

      // Act
      const summary = createChangeSummary(diffs, 'Mixed changes');

      // Assert
      expect(summary.filesAdded).toBe(2);
      expect(summary.filesModified).toBe(1);
      expect(summary.filesDeleted).toBe(1);
    });

    it('should handle empty diffs array', () => {
      // Arrange
      const diffs: FileDiff[] = [];

      // Act
      const summary = createChangeSummary(diffs, 'No changes');

      // Assert
      expect(summary.filesAdded).toBe(0);
      expect(summary.filesModified).toBe(0);
      expect(summary.filesDeleted).toBe(0);
      expect(summary.linesAdded).toBe(0);
      expect(summary.linesDeleted).toBe(0);
    });

    it('should include file paths in affected files', () => {
      // Arrange
      const diffs: FileDiff[] = [
        { filePath: 'src/test.ts', status: 'added', hunks: [] },
      ];

      // Act
      const summary = createChangeSummary(diffs, 'Add test');

      // Assert
      expect(summary.affectedFiles).toContain('src/test.ts');
    });

    it('should calculate lines added and deleted from hunks', () => {
      // Arrange
      const diffs: FileDiff[] = [
        {
          filePath: 'src/test.ts',
          status: 'modified',
          hunks: [
            {
              oldStart: 1,
              oldLines: 2,
              newStart: 1,
              newLines: 3,
              changes: [
                { type: 'delete', lineNumber: 1, content: 'line1' },
                { type: 'add', lineNumber: 1, content: 'line1' },
                { type: 'add', lineNumber: 2, content: 'line2' },
              ],
            },
          ],
        },
      ];

      // Act
      const summary = createChangeSummary(diffs, 'Modify with hunks');

      // Assert
      expect(summary.linesAdded).toBe(2);
      expect(summary.linesDeleted).toBe(1);
    });

    it('should handle large number of changes efficiently', () => {
      // Arrange
      const diffs: FileDiff[] = Array.from({ length: 1000 }, (_, i) => ({
        filePath: `src/file${i}.ts`,
        status: 'added' as const,
        hunks: [],
      }));

      // Act
      const summary = createChangeSummary(diffs, 'Add many files');

      // Assert
      expect(summary.filesAdded).toBe(1000);
      expect(summary.affectedFiles).toHaveLength(1000);
    });

    it('should handle special characters in file paths', () => {
      // Arrange
      const diffs: FileDiff[] = [
        { filePath: 'src/file with spaces.ts', status: 'added', hunks: [] },
        { filePath: 'src/file-with-dashes.ts', status: 'added', hunks: [] },
        { filePath: 'src/file_with_underscores.ts', status: 'added', hunks: [] },
      ];

      // Act
      const summary = createChangeSummary(diffs, 'Special chars');

      // Assert
      expect(summary.filesAdded).toBe(3);
      expect(summary.affectedFiles).toHaveLength(3);
    });

    it('should handle nested directory structures', () => {
      // Arrange
      const diffs: FileDiff[] = [
        { filePath: 'src/components/Button.tsx', status: 'added', hunks: [] },
        { filePath: 'src/utils/helpers.ts', status: 'added', hunks: [] },
        { filePath: 'src/api/routes.ts', status: 'added', hunks: [] },
      ];

      // Act
      const summary = createChangeSummary(diffs, 'Nested dirs');

      // Assert
      expect(summary.filesAdded).toBe(3);
      expect(summary.affectedFiles).toContain('src/components/Button.tsx');
    });

    it('should generate proper description for single file added', () => {
      // Arrange
      const diffs: FileDiff[] = [
        { filePath: 'src/test.ts', status: 'added', hunks: [] },
      ];

      // Act
      const summary = createChangeSummary(diffs, 'Add file');

      // Assert
      expect(summary.description).toContain('1 file added');
    });

    it('should generate proper description for multiple files', () => {
      // Arrange
      const diffs: FileDiff[] = [
        { filePath: 'src/file1.ts', status: 'added', hunks: [] },
        { filePath: 'src/file2.ts', status: 'added', hunks: [] },
      ];

      // Act
      const summary = createChangeSummary(diffs, 'Add files');

      // Assert
      expect(summary.description).toContain('2 files added');
    });

    it('should generate description with line counts', () => {
      // Arrange
      const diffs: FileDiff[] = [
        {
          filePath: 'src/test.ts',
          status: 'modified',
          hunks: [
            {
              oldStart: 1,
              oldLines: 1,
              newStart: 1,
              newLines: 2,
              changes: [
                { type: 'delete', lineNumber: 1, content: 'old' },
                { type: 'add', lineNumber: 1, content: 'new1' },
                { type: 'add', lineNumber: 2, content: 'new2' },
              ],
            },
          ],
        },
      ];

      // Act
      const summary = createChangeSummary(diffs, 'Modify');

      // Assert
      expect(summary.description).toContain('2 lines added');
      expect(summary.description).toContain('1 lines deleted');
    });

    it('should generate "No changes made" for empty diffs', () => {
      // Arrange
      const diffs: FileDiff[] = [];

      // Act
      const summary = createChangeSummary(diffs, 'Empty');

      // Assert
      expect(summary.description).toBe('No changes made');
    });

    it('should include all change types in description', () => {
      // Arrange
      const diffs: FileDiff[] = [
        { filePath: 'src/added.ts', status: 'added', hunks: [] },
        { filePath: 'src/modified.ts', status: 'modified', hunks: [] },
        { filePath: 'src/deleted.ts', status: 'deleted', hunks: [] },
      ];

      // Act
      const summary = createChangeSummary(diffs, 'All types');

      // Assert
      expect(summary.description).toContain('1 file added');
      expect(summary.description).toContain('1 file modified');
      expect(summary.description).toContain('1 file deleted');
    });
  });
});
