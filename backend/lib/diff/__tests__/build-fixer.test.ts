import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildProjectView } from '../build-fixer';
import type { ProjectState } from '@ai-app-builder/shared';

describe('buildProjectView', () => {
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
        'package.json': '{"name":"test"}',
      },
    };
  });

  describe('happy path', () => {
    it('should create temp view with new file content', () => {
      const updatedFiles = {
        'src/new-file.ts': 'export const newFile = "new";',
      };

      const result = buildProjectView(mockProjectState, updatedFiles);

      expect(result).toHaveProperty('src/new-file.ts');
      expect(result['src/new-file.ts']).toBe('export const newFile = "new";');
    });

    it('should create temp view with modified file content', () => {
      const updatedFiles = {
        'src/index.ts': 'export const foo = "modified";',
      };

      const result = buildProjectView(mockProjectState, updatedFiles);

      expect(result['src/index.ts']).toBe('export const foo = "modified";');
    });

    it('should create temp view with deleted file (null content)', () => {
      const updatedFiles = {
        'src/utils.ts': null,
      };

      const result = buildProjectView(mockProjectState, updatedFiles);

      expect(result).not.toHaveProperty('src/utils.ts');
    });

    it('should preserve unchanged files in temp view', () => {
      const updatedFiles = {
        'src/index.ts': 'export const foo = "modified";',
      };

      const result = buildProjectView(mockProjectState, updatedFiles);

      expect(result['src/utils.ts']).toBe(mockProjectState.files['src/utils.ts']);
      expect(result['package.json']).toBe(mockProjectState.files['package.json']);
    });

    it('should handle multiple file updates', () => {
      const updatedFiles = {
        'src/index.ts': 'export const foo = "modified";',
        'src/utils.ts': null,
        'src/new.ts': 'export const new = "new";',
      };

      const result = buildProjectView(mockProjectState, updatedFiles);

      expect(result['src/index.ts']).toBe('export const foo = "modified";');
      expect(result).not.toHaveProperty('src/utils.ts');
      expect(result['src/new.ts']).toBe('export const new = "new";');
      expect(result['package.json']).toBe(mockProjectState.files['package.json']);
    });
  });

  describe('edge cases', () => {
    it('should return empty object when project has no files', () => {
      const emptyProject: ProjectState = {
        ...mockProjectState,
        files: {},
      };
      const updatedFiles = {};

      const result = buildProjectView(emptyProject, updatedFiles);

      expect(result).toEqual({});
    });

    it('should return empty object when updatedFiles is empty', () => {
      const updatedFiles = {};

      const result = buildProjectView(mockProjectState, updatedFiles);

      expect(result).toEqual(mockProjectState.files);
    });

    it('should handle deleting all files', () => {
      const updatedFiles = {
        'src/index.ts': null,
        'src/utils.ts': null,
        'package.json': null,
      };

      const result = buildProjectView(mockProjectState, updatedFiles);

      expect(result).toEqual({});
    });

    it('should handle adding files to empty project', () => {
      const emptyProject: ProjectState = {
        ...mockProjectState,
        files: {},
      };
      const updatedFiles = {
        'src/index.ts': 'export const foo = "bar";',
      };

      const result = buildProjectView(emptyProject, updatedFiles);

      expect(result).toEqual(updatedFiles);
    });

    it('should handle file content with special characters', () => {
      const updatedFiles = {
        'src/special.ts': 'export const special = "特殊\\n\\tchars";',
      };

      const result = buildProjectView(mockProjectState, updatedFiles);

      expect(result['src/special.ts']).toBe('export const special = "特殊\\n\\tchars";');
    });
  });

  describe('error handling', () => {
    it('should handle null project files gracefully', () => {
      const projectWithNullFiles: ProjectState = {
        ...mockProjectState,
        files: null as unknown as Record<string, string>,
      };
      const updatedFiles = {};

      const result = buildProjectView(projectWithNullFiles, updatedFiles);

      expect(result).toEqual({});
    });

    it('should handle undefined project files gracefully', () => {
      const projectWithUndefinedFiles: ProjectState = {
        ...mockProjectState,
        files: undefined as unknown as Record<string, string>,
      };
      const updatedFiles = {};

      const result = buildProjectView(projectWithUndefinedFiles, updatedFiles);

      expect(result).toEqual({});
    });
  });

  describe('return value shape', () => {
    it('should return object with string keys and string values', () => {
      const updatedFiles = {
        'src/test.ts': 'export const test = "test";',
      };

      const result = buildProjectView(mockProjectState, updatedFiles);

      expect(typeof result).toBe('object');
      for (const [key, value] of Object.entries(result)) {
        expect(typeof key).toBe('string');
        expect(typeof value).toBe('string');
      }
    });
  });

  describe('side effects', () => {
    it('should not mutate original project state', () => {
      const updatedFiles = {
        'src/index.ts': 'export const foo = "modified";',
      };
      const originalFiles = { ...mockProjectState.files };

      buildProjectView(mockProjectState, updatedFiles);

      expect(mockProjectState.files).toEqual(originalFiles);
    });

    it('should not mutate original updatedFiles object', () => {
      const updatedFiles = {
        'src/index.ts': 'export const foo = "modified";',
      };
      const originalUpdatedFiles = { ...updatedFiles };

      buildProjectView(mockProjectState, updatedFiles);

      expect(updatedFiles).toEqual(originalUpdatedFiles);
    });
  });
});
