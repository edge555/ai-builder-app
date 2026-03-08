import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyFileEdits } from '../file-edit-applicator';
import type { ProjectState } from '@ai-app-builder/shared';

// Mock formatCode function
vi.mock('../../prettier-config', () => ({
  formatCode: vi.fn(async (code: string) => code),
}));

describe('applyFileEdits', () => {
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
    it('should apply create operation successfully', async () => {
      const aiFilesArray = [
        {
          path: 'src/new.ts',
          operation: 'create',
          content: 'export const new = "new";',
        },
      ];

      const result = await applyFileEdits(aiFilesArray, mockProjectState);

      expect(result.success).toBe(true);
      expect(result.updatedFiles?.['src/new.ts']).toBe('export const new = "new";');
      expect(result.deletedFiles).toEqual([]);
    });

    it('should apply modify operation successfully', async () => {
      const aiFilesArray = [
        {
          path: 'src/index.ts',
          operation: 'modify',
          edits: [
            {
              search: 'export const foo = "bar";',
              replace: 'export const foo = "modified";',
            },
          ],
        },
      ];

      const result = await applyFileEdits(aiFilesArray, mockProjectState);

      expect(result.success).toBe(true);
      expect(result.updatedFiles?.['src/index.ts']).toContain('modified');
    });

    it('should apply delete operation successfully', async () => {
      const aiFilesArray = [
        {
          path: 'src/utils.ts',
          operation: 'delete',
        },
      ];

      const result = await applyFileEdits(aiFilesArray, mockProjectState);

      expect(result.success).toBe(true);
      expect(result.deletedFiles).toContain('src/utils.ts');
      expect(result.updatedFiles?.['src/utils.ts']).toBeNull();
    });

    it('should apply replace_file operation successfully', async () => {
      const aiFilesArray = [
        {
          path: 'src/index.ts',
          operation: 'replace_file',
          content: 'export const replaced = "replaced";',
        },
      ];

      const result = await applyFileEdits(aiFilesArray, mockProjectState);

      expect(result.success).toBe(true);
      expect(result.updatedFiles?.['src/index.ts']).toBe('export const replaced = "replaced";');
    });

    it('should handle multiple file operations', async () => {
      const aiFilesArray = [
        {
          path: 'src/new.ts',
          operation: 'create',
          content: 'export const new = "new";',
        },
        {
          path: 'src/index.ts',
          operation: 'modify',
          edits: [
            {
              search: 'export const foo = "bar";',
              replace: 'export const foo = "modified";',
            },
          ],
        },
        {
          path: 'src/utils.ts',
          operation: 'delete',
        },
      ];

      const result = await applyFileEdits(aiFilesArray, mockProjectState);

      expect(result.success).toBe(true);
      expect(result.updatedFiles?.['src/new.ts']).toBeDefined();
      expect(result.updatedFiles?.['src/index.ts']).toContain('modified');
      expect(result.deletedFiles).toContain('src/utils.ts');
    });
  });

  describe('edge cases', () => {
    it('should handle empty file edits array', async () => {
      const aiFilesArray: any[] = [];

      const result = await applyFileEdits(aiFilesArray, mockProjectState);

      expect(result.success).toBe(true);
      expect(result.updatedFiles).toEqual({});
      expect(result.deletedFiles).toEqual([]);
    });

    it('should handle file path with spaces', async () => {
      const aiFilesArray = [
        {
          path: 'src/ new .ts',
          operation: 'create',
          content: 'export const test = "test";',
        },
      ];

      const result = await applyFileEdits(aiFilesArray, mockProjectState);

      expect(result.success).toBe(true);
      expect(result.updatedFiles?.['src/new.ts']).toBeDefined();
    });

    it('should handle escaped newlines in content', async () => {
      const aiFilesArray = [
        {
          path: 'src/new.ts',
          operation: 'create',
          content: 'export const test = "line1\\nline2";',
        },
      ];

      const result = await applyFileEdits(aiFilesArray, mockProjectState);

      expect(result.success).toBe(true);
      expect(result.updatedFiles?.['src/new.ts']).toContain('line1\nline2');
    });

    it('should handle escaped tabs in content', async () => {
      const aiFilesArray = [
        {
          path: 'src/new.ts',
          operation: 'create',
          content: 'export const test = "tab\\there";',
        },
      ];

      const result = await applyFileEdits(aiFilesArray, mockProjectState);

      expect(result.success).toBe(true);
      expect(result.updatedFiles?.['src/new.ts']).toContain('tab\there');
    });
  });

  describe('error handling', () => {
    it('should skip file entry without path', async () => {
      const aiFilesArray: any[] = [
        {
          operation: 'create',
          content: 'export const test = "test";',
        },
      ];

      const result = await applyFileEdits(aiFilesArray, mockProjectState);

      expect(result.success).toBe(true);
      expect(Object.keys(result.updatedFiles || {})).toHaveLength(0);
    });

    it('should skip create operation without content', async () => {
      const aiFilesArray = [
        {
          path: 'src/new.ts',
          operation: 'create',
        },
      ];

      const result = await applyFileEdits(aiFilesArray, mockProjectState);

      expect(result.success).toBe(true);
      expect(result.updatedFiles?.['src/new.ts']).toBeUndefined();
    });

    it('should skip modify operation without edits', async () => {
      const aiFilesArray = [
        {
          path: 'src/index.ts',
          operation: 'modify',
        },
      ];

      const result = await applyFileEdits(aiFilesArray, mockProjectState);

      expect(result.success).toBe(true);
      expect(result.updatedFiles?.['src/index.ts']).toBeUndefined();
    });

    it('should skip modify operation for non-existent file', async () => {
      const aiFilesArray = [
        {
          path: 'src/nonexistent.ts',
          operation: 'modify',
          edits: [
            {
              search: 'test',
              replace: 'modified',
            },
          ],
        },
      ];

      const result = await applyFileEdits(aiFilesArray, mockProjectState);

      expect(result.success).toBe(true);
      expect(result.updatedFiles?.['src/nonexistent.ts']).toBeUndefined();
    });

    it('should return error when edit application fails', async () => {
      const aiFilesArray = [
        {
          path: 'src/index.ts',
          operation: 'modify',
          edits: [
            {
              search: 'nonexistent string',
              replace: 'modified',
            },
          ],
        },
      ];

      const result = await applyFileEdits(aiFilesArray, mockProjectState);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('src/index.ts');
    });

    it('should skip unknown operation type', async () => {
      const aiFilesArray: any[] = [
        {
          path: 'src/test.ts',
          operation: 'unknown',
          content: 'test',
        },
      ];

      const result = await applyFileEdits(aiFilesArray, mockProjectState);

      expect(result.success).toBe(true);
      expect(result.updatedFiles?.['src/test.ts']).toBeUndefined();
    });

    it('should skip replace_file operation without content', async () => {
      const aiFilesArray = [
        {
          path: 'src/index.ts',
          operation: 'replace_file',
        },
      ];

      const result = await applyFileEdits(aiFilesArray, mockProjectState);

      expect(result.success).toBe(true);
      expect(result.updatedFiles?.['src/index.ts']).toBeUndefined();
    });
  });

  describe('return value shape', () => {
    it('should return object with success boolean', async () => {
      const aiFilesArray = [
        {
          path: 'src/new.ts',
          operation: 'create',
          content: 'export const new = "new";',
        },
      ];

      const result = await applyFileEdits(aiFilesArray, mockProjectState);

      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
    });

    it('should return updatedFiles object when successful', async () => {
      const aiFilesArray = [
        {
          path: 'src/new.ts',
          operation: 'create',
          content: 'export const new = "new";',
        },
      ];

      const result = await applyFileEdits(aiFilesArray, mockProjectState);

      expect(result).toHaveProperty('updatedFiles');
      expect(typeof result.updatedFiles).toBe('object');
    });

    it('should return deletedFiles array when successful', async () => {
      const aiFilesArray = [
        {
          path: 'src/utils.ts',
          operation: 'delete',
        },
      ];

      const result = await applyFileEdits(aiFilesArray, mockProjectState);

      expect(result).toHaveProperty('deletedFiles');
      expect(Array.isArray(result.deletedFiles)).toBe(true);
    });

    it('should return error string when failed', async () => {
      const aiFilesArray = [
        {
          path: 'src/index.ts',
          operation: 'modify',
          edits: [
            {
              search: 'nonexistent',
              replace: 'modified',
            },
          ],
        },
      ];

      const result = await applyFileEdits(aiFilesArray, mockProjectState);

      expect(result).toHaveProperty('error');
      expect(typeof result.error).toBe('string');
    });
  });

  describe('side effects', () => {
    it('should not mutate project state', async () => {
      const aiFilesArray = [
        {
          path: 'src/new.ts',
          operation: 'create',
          content: 'export const new = "new";',
        },
      ];
      const originalFiles = { ...mockProjectState.files };

      await applyFileEdits(aiFilesArray, mockProjectState);

      expect(mockProjectState.files).toEqual(originalFiles);
    });

    it('should not mutate input file edits array', async () => {
      const aiFilesArray = [
        {
          path: 'src/new.ts',
          operation: 'create',
          content: 'export const new = "new";',
        },
      ];
      const originalEdits = JSON.parse(JSON.stringify(aiFilesArray));

      await applyFileEdits(aiFilesArray, mockProjectState);

      expect(aiFilesArray).toEqual(originalEdits);
    });
  });
});
