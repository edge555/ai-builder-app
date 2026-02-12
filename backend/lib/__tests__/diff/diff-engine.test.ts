/**
 * Tests for Diff Engine Service
 * Validates Requirements 5.1, 5.3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDiffEngine,
  DiffEngine,
} from '../../diff';
import type { ProjectState, FileDiff } from '@ai-app-builder/shared';

describe('DiffEngine', () => {
  let diffEngine: DiffEngine;

  beforeEach(() => {
    diffEngine = createDiffEngine();
  });

  describe('computeDiffs', () => {
    it('should detect added files', () => {
      const oldState: ProjectState = {
        id: 'test-project',
        name: 'Test Project',
        description: 'Test',
        files: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        currentVersionId: 'v1',
      };

      const newState: ProjectState = {
        ...oldState,
        files: {
          'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
        },
      };

      const diffs = diffEngine.computeDiffs(oldState, newState);

      expect(diffs).toHaveLength(1);
      expect(diffs[0].filePath).toBe('src/App.tsx');
      expect(diffs[0].status).toBe('added');
      expect(diffs[0].hunks).toHaveLength(1);
      expect(diffs[0].hunks[0].changes.every(c => c.type === 'add')).toBe(true);
    });

    it('should detect deleted files', () => {
      const oldState: ProjectState = {
        id: 'test-project',
        name: 'Test Project',
        description: 'Test',
        files: {
          'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        currentVersionId: 'v1',
      };

      const newState: ProjectState = {
        ...oldState,
        files: {},
      };

      const diffs = diffEngine.computeDiffs(oldState, newState);

      expect(diffs).toHaveLength(1);
      expect(diffs[0].filePath).toBe('src/App.tsx');
      expect(diffs[0].status).toBe('deleted');
      expect(diffs[0].hunks).toHaveLength(1);
      expect(diffs[0].hunks[0].changes.every(c => c.type === 'delete')).toBe(true);
    });

    it('should detect modified files', () => {
      const oldState: ProjectState = {
        id: 'test-project',
        name: 'Test Project',
        description: 'Test',
        files: {
          'src/App.tsx': 'export default function App() {\n  return <div>Hello</div>;\n}',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        currentVersionId: 'v1',
      };

      const newState: ProjectState = {
        ...oldState,
        files: {
          'src/App.tsx': 'export default function App() {\n  return <div>Hello World</div>;\n}',
        },
      };

      const diffs = diffEngine.computeDiffs(oldState, newState);

      expect(diffs).toHaveLength(1);
      expect(diffs[0].filePath).toBe('src/App.tsx');
      expect(diffs[0].status).toBe('modified');
    });

    it('should handle null old state (initial version)', () => {
      const newState: ProjectState = {
        id: 'test-project',
        name: 'Test Project',
        description: 'Test',
        files: {
          'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
          'package.json': '{ "name": "test" }',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        currentVersionId: 'v1',
      };

      const diffs = diffEngine.computeDiffs(null, newState);

      expect(diffs).toHaveLength(2);
      expect(diffs.every(d => d.status === 'added')).toBe(true);
    });

    it('should return empty array when no changes', () => {
      const state: ProjectState = {
        id: 'test-project',
        name: 'Test Project',
        description: 'Test',
        files: {
          'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        currentVersionId: 'v1',
      };

      const diffs = diffEngine.computeDiffs(state, state);

      expect(diffs).toHaveLength(0);
    });

    it('should sort diffs by file path', () => {
      const oldState: ProjectState = {
        id: 'test-project',
        name: 'Test Project',
        description: 'Test',
        files: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        currentVersionId: 'v1',
      };

      const newState: ProjectState = {
        ...oldState,
        files: {
          'src/components/Button.tsx': 'button',
          'src/App.tsx': 'app',
          'package.json': 'pkg',
        },
      };

      const diffs = diffEngine.computeDiffs(oldState, newState);

      expect(diffs).toHaveLength(3);
      expect(diffs[0].filePath).toBe('package.json');
      expect(diffs[1].filePath).toBe('src/App.tsx');
      expect(diffs[2].filePath).toBe('src/components/Button.tsx');
    });
  });

  describe('computeDiffsFromFiles', () => {
    it('should compute diffs between file maps', () => {
      const oldFiles = {
        'file1.ts': 'content1',
      };

      const newFiles = {
        'file1.ts': 'content1-modified',
        'file2.ts': 'content2',
      };

      const diffs = diffEngine.computeDiffsFromFiles(oldFiles, newFiles);

      expect(diffs).toHaveLength(2);
      expect(diffs.find(d => d.filePath === 'file1.ts')?.status).toBe('modified');
      expect(diffs.find(d => d.filePath === 'file2.ts')?.status).toBe('added');
    });
  });

  describe('generateChangeSummary', () => {
    it('should generate correct summary for added files', () => {
      const diffs: FileDiff[] = [
        {
          filePath: 'src/App.tsx',
          status: 'added',
          hunks: [{
            oldStart: 0,
            oldLines: 0,
            newStart: 1,
            newLines: 3,
            changes: [
              { type: 'add', lineNumber: 1, content: 'line1' },
              { type: 'add', lineNumber: 2, content: 'line2' },
              { type: 'add', lineNumber: 3, content: 'line3' },
            ],
          }],
        },
      ];

      const summary = diffEngine.generateChangeSummary(diffs);

      expect(summary.filesAdded).toBe(1);
      expect(summary.filesModified).toBe(0);
      expect(summary.filesDeleted).toBe(0);
      expect(summary.linesAdded).toBe(3);
      expect(summary.linesDeleted).toBe(0);
      expect(summary.affectedFiles).toContain('src/App.tsx');
      expect(summary.description).toContain('1 file added');
    });

    it('should generate correct summary for mixed changes', () => {
      const diffs: FileDiff[] = [
        {
          filePath: 'src/App.tsx',
          status: 'modified',
          hunks: [{
            oldStart: 1,
            oldLines: 2,
            newStart: 1,
            newLines: 3,
            changes: [
              { type: 'delete', lineNumber: 1, content: 'old' },
              { type: 'add', lineNumber: 1, content: 'new1' },
              { type: 'add', lineNumber: 2, content: 'new2' },
            ],
          }],
        },
        {
          filePath: 'src/Button.tsx',
          status: 'added',
          hunks: [{
            oldStart: 0,
            oldLines: 0,
            newStart: 1,
            newLines: 1,
            changes: [
              { type: 'add', lineNumber: 1, content: 'button' },
            ],
          }],
        },
        {
          filePath: 'src/Old.tsx',
          status: 'deleted',
          hunks: [{
            oldStart: 1,
            oldLines: 2,
            newStart: 0,
            newLines: 0,
            changes: [
              { type: 'delete', lineNumber: 1, content: 'old1' },
              { type: 'delete', lineNumber: 2, content: 'old2' },
            ],
          }],
        },
      ];

      const summary = diffEngine.generateChangeSummary(diffs);

      expect(summary.filesAdded).toBe(1);
      expect(summary.filesModified).toBe(1);
      expect(summary.filesDeleted).toBe(1);
      expect(summary.linesAdded).toBe(3);
      expect(summary.linesDeleted).toBe(3);
      expect(summary.affectedFiles).toHaveLength(3);
    });

    it('should handle empty diffs', () => {
      const summary = diffEngine.generateChangeSummary([]);

      expect(summary.filesAdded).toBe(0);
      expect(summary.filesModified).toBe(0);
      expect(summary.filesDeleted).toBe(0);
      expect(summary.linesAdded).toBe(0);
      expect(summary.linesDeleted).toBe(0);
      expect(summary.description).toBe('No changes');
      expect(summary.affectedFiles).toHaveLength(0);
    });
  });

  describe('DiffEngine class', () => {
    it('should provide computeDiffs method', () => {
      const oldState: ProjectState = {
        id: 'test-project',
        name: 'Test Project',
        description: 'Test',
        files: { 'file.ts': 'old' },
        createdAt: new Date(),
        updatedAt: new Date(),
        currentVersionId: 'v1',
      };

      const newState: ProjectState = {
        ...oldState,
        files: { 'file.ts': 'new' },
      };

      const diffs = diffEngine.computeDiffs(oldState, newState);

      expect(diffs).toHaveLength(1);
      expect(diffs[0].status).toBe('modified');
    });

    it('should provide computeDiffsFromFiles method', () => {
      const diffs = diffEngine.computeDiffsFromFiles(
        { 'file.ts': 'old' },
        { 'file.ts': 'new' }
      );

      expect(diffs).toHaveLength(1);
    });

    it('should provide generateChangeSummary method', () => {
      const diffs: FileDiff[] = [{
        filePath: 'test.ts',
        status: 'added',
        hunks: [],
      }];

      const summary = diffEngine.generateChangeSummary(diffs);

      expect(summary.filesAdded).toBe(1);
    });
  });

  describe('line-level diff accuracy', () => {
    it('should correctly identify added lines in the middle', () => {
      const oldContent = 'line1\nline2\nline3';
      const newContent = 'line1\nline2\nnew line\nline3';

      const diffs = diffEngine.computeDiffsFromFiles(
        { 'file.ts': oldContent },
        { 'file.ts': newContent }
      );

      expect(diffs).toHaveLength(1);
      expect(diffs[0].status).toBe('modified');

      // Should have an add change for 'new line'
      const addChanges = diffs[0].hunks.flatMap(h => h.changes).filter(c => c.type === 'add');
      expect(addChanges.some(c => c.content === 'new line')).toBe(true);
    });

    it('should correctly identify deleted lines', () => {
      const oldContent = 'line1\nline2\nline3';
      const newContent = 'line1\nline3';

      const diffs = diffEngine.computeDiffsFromFiles(
        { 'file.ts': oldContent },
        { 'file.ts': newContent }
      );

      expect(diffs).toHaveLength(1);
      expect(diffs[0].status).toBe('modified');

      // Should have a delete change for 'line2'
      const deleteChanges = diffs[0].hunks.flatMap(h => h.changes).filter(c => c.type === 'delete');
      expect(deleteChanges.some(c => c.content === 'line2')).toBe(true);
    });

    it('should correctly identify replaced lines', () => {
      const oldContent = 'line1\nold line\nline3';
      const newContent = 'line1\nnew line\nline3';

      const diffs = diffEngine.computeDiffsFromFiles(
        { 'file.ts': oldContent },
        { 'file.ts': newContent }
      );

      expect(diffs).toHaveLength(1);
      expect(diffs[0].status).toBe('modified');

      const changes = diffs[0].hunks.flatMap(h => h.changes);
      const deleteChanges = changes.filter(c => c.type === 'delete');
      const addChanges = changes.filter(c => c.type === 'add');

      expect(deleteChanges.some(c => c.content === 'old line')).toBe(true);
      expect(addChanges.some(c => c.content === 'new line')).toBe(true);
    });
  });
});
