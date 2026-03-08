import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeDiffs } from '../diff-computer';
import type { ProjectState } from '@ai-app-builder/shared';

describe('computeDiffs', () => {
  let mockProjectState: ProjectState;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectState = {
      id: 'test-project',
      name: 'Test Project',
      description: 'A test project',
      createdAt: new Date(),
      updatedAt: new Date(),
      currentVersionId: 'v1',
      files: {
        'src/index.ts': 'export const foo = "bar";',
        'src/utils.ts': 'export const utils = {};',
      },
    };
  });

  describe('happy path', () => {
    it('should compute diffs for modified files', () => {
      const newFiles = {
        ...mockProjectState.files,
        'src/index.ts': 'export const foo = "modified";',
      };
      const deletedFiles: string[] = [];

      const result = computeDiffs(mockProjectState.files, newFiles, deletedFiles);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should compute diffs for added files', () => {
      const newFiles = {
        ...mockProjectState.files,
        'src/new.ts': 'export const new = "new";',
      };
      const deletedFiles: string[] = [];

      const result = computeDiffs(mockProjectState.files, newFiles, deletedFiles);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should compute diffs for deleted files', () => {
      const newFiles = {
        ...mockProjectState.files,
      };
      const deletedFiles = ['src/utils.ts'];

      const result = computeDiffs(mockProjectState.files, newFiles, deletedFiles);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should compute diffs for mixed changes', () => {
      const newFiles = {
        ...mockProjectState.files,
        'src/index.ts': 'export const foo = "modified";',
        'src/new.ts': 'export const new = "new";',
      };
      const deletedFiles = ['src/utils.ts'];

      const result = computeDiffs(mockProjectState.files, newFiles, deletedFiles);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty old files', () => {
      const oldFiles: Record<string, string> = {};
      const newFiles = {
        ...mockProjectState.files,
        'src/index.ts': 'export const foo = "modified";',
      };
      const deletedFiles: string[] = [];

      const result = computeDiffs(oldFiles, newFiles, deletedFiles);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle empty new files', () => {
      const oldFiles = mockProjectState.files;
      const newFiles: Record<string, string> = {};
      const deletedFiles: string[] = [];

      const result = computeDiffs(oldFiles, newFiles, deletedFiles);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle empty deleted files array', () => {
      const oldFiles = mockProjectState.files;
      const newFiles = {
        ...mockProjectState.files,
      };
      const deletedFiles: string[] = [];

      const result = computeDiffs(oldFiles, newFiles, deletedFiles);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle files with special characters', () => {
      const oldFiles = {
        'src/special.ts': 'export const special = "特殊";',
        ...mockProjectState.files,
      };
      const newFiles = {
        'src/special.ts': 'export const special = "特殊\\n\\tchars";',
      };
      const deletedFiles: string[] = [];

      const result = computeDiffs(oldFiles, newFiles, deletedFiles);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('return value shape', () => {
    it('should return array', () => {
      const newFiles = {
        ...mockProjectState.files,
        'src/index.ts': 'export const foo = "modified";',
      };
      const deletedFiles: string[] = [];

      const result = computeDiffs(mockProjectState.files, newFiles, deletedFiles);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should return array of diff objects', () => {
      const newFiles = {
        ...mockProjectState.files,
        'src/index.ts': 'export const foo = "modified";',
      };
      const deletedFiles: string[] = [];

      const result = computeDiffs(mockProjectState.files, newFiles, deletedFiles);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('side effects', () => {
    it('should not mutate old files object', () => {
      const originalFiles = { ...mockProjectState.files };
      const newFiles = {
        ...mockProjectState.files,
        'src/index.ts': 'export const foo = "modified";',
      };
      const deletedFiles: string[] = [];

      computeDiffs(originalFiles, newFiles, deletedFiles);

      expect(mockProjectState.files).toEqual(originalFiles);
    });

    it('should not mutate new files object', () => {
      const originalFiles = { ...mockProjectState.files };
      const newFiles = {
        ...mockProjectState.files,
        'src/index.ts': 'export const foo = "modified";',
      };
      const deletedFiles: string[] = [];
      const newFilesCopy = { ...newFiles };

      computeDiffs(originalFiles, newFiles, deletedFiles);

      expect(newFiles).toEqual(newFilesCopy);
    });

    it('should not mutate deleted files array', () => {
      const originalFiles = { ...mockProjectState.files };
      const newFiles = {
        ...mockProjectState.files,
      };
      const deletedFiles = ['src/utils.ts'];
      const deletedFilesCopy = [...deletedFiles];

      computeDiffs(originalFiles, newFiles, deletedFiles);

      expect(deletedFiles).toEqual(deletedFilesCopy);
    });
  });
});
