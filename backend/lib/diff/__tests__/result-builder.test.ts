import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createModificationResult } from '../result-builder';
import type { ProjectState } from '@ai-app-builder/shared';

// Mock dependencies
vi.mock('../diff-computer', () => ({
  computeDiffs: vi.fn(() => []),
}));

vi.mock('../change-summarizer', () => ({
  createChangeSummary: vi.fn(() => 'Test summary'),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-123'),
}));

describe('createModificationResult', () => {
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
    it('should create modification result with new file', async () => {
      const updatedFiles = {
        'src/new.ts': 'export const new = "new";',
      };
      const deletedFiles: string[] = [];
      const prompt = 'Add new file';

      const result = await createModificationResult(mockProjectState, updatedFiles, deletedFiles, prompt);

      expect(result.success).toBe(true);
      expect(result.projectState?.files['src/new.ts']).toBe('export const new = "new";');
      expect(result.version?.id).toBe('test-uuid-123');
    });

    it('should create modification result with modified file', async () => {
      const updatedFiles = {
        'src/index.ts': 'export const foo = "modified";',
      };
      const deletedFiles: string[] = [];
      const prompt = 'Modify index';

      const result = await createModificationResult(mockProjectState, updatedFiles, deletedFiles, prompt);

      expect(result.success).toBe(true);
      expect(result.projectState?.files['src/index.ts']).toBe('export const foo = "modified";');
      expect(result.version?.prompt).toBe('Modify index');
    });

    it('should create modification result with deleted file', async () => {
      const updatedFiles = {
        'src/utils.ts': null,
      };
      const deletedFiles = ['src/utils.ts'];
      const prompt = 'Delete utils';

      const result = await createModificationResult(mockProjectState, updatedFiles, deletedFiles, prompt);

      expect(result.success).toBe(true);
      expect(result.projectState?.files).not.toHaveProperty('src/utils.ts');
    });

    it('should create modification result with multiple changes', async () => {
      const updatedFiles = {
        'src/new.ts': 'export const new = "new";',
        'src/index.ts': 'export const foo = "modified";',
        'src/utils.ts': null,
      };
      const deletedFiles = ['src/utils.ts'];
      const prompt = 'Multiple changes';

      const result = await createModificationResult(mockProjectState, updatedFiles, deletedFiles, prompt);

      expect(result.success).toBe(true);
      expect(result.projectState?.files['src/new.ts']).toBeDefined();
      expect(result.projectState?.files['src/index.ts']).toBe('export const foo = "modified";');
      expect(result.projectState?.files).not.toHaveProperty('src/utils.ts');
    });
  });

  describe('edge cases', () => {
    it('should handle empty updated files', async () => {
      const updatedFiles: Record<string, string | null> = {};
      const deletedFiles: string[] = [];
      const prompt = 'No changes';

      const result = await createModificationResult(mockProjectState, updatedFiles, deletedFiles, prompt);

      expect(result.success).toBe(true);
      expect(result.projectState?.files).toEqual(mockProjectState.files);
    });

    it('should handle empty deleted files array', async () => {
      const updatedFiles = {
        'src/new.ts': 'export const new = "new";',
      };
      const deletedFiles: string[] = [];
      const prompt = 'Add file';

      const result = await createModificationResult(mockProjectState, updatedFiles, deletedFiles, prompt);

      expect(result.success).toBe(true);
      expect(result.diffs).toEqual([]);
    });

    it('should handle empty prompt', async () => {
      const updatedFiles = {
        'src/new.ts': 'export const new = "new";',
      };
      const deletedFiles: string[] = [];
      const prompt = '';

      const result = await createModificationResult(mockProjectState, updatedFiles, deletedFiles, prompt);

      expect(result.success).toBe(true);
      expect(result.version?.prompt).toBe('');
    });

    it('should handle project with single file', async () => {
      const singleFileProject: ProjectState = {
        ...mockProjectState,
        files: {
          'src/index.ts': 'export const foo = "bar";',
        },
      };
      const updatedFiles = {
        'src/index.ts': 'export const foo = "modified";',
      };
      const deletedFiles: string[] = [];
      const prompt = 'Modify single file';

      const result = await createModificationResult(singleFileProject, updatedFiles, deletedFiles, prompt);

      expect(result.success).toBe(true);
      expect(result.projectState?.files['src/index.ts']).toBe('export const foo = "modified";');
    });
  });

  describe('return value shape', () => {
    it('should return object with success boolean', async () => {
      const updatedFiles = {
        'src/new.ts': 'export const new = "new";',
      };
      const deletedFiles: string[] = [];
      const prompt = 'Test prompt';

      const result = await createModificationResult(mockProjectState, updatedFiles, deletedFiles, prompt);

      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
    });

    it('should return projectState with updated files', async () => {
      const updatedFiles = {
        'src/new.ts': 'export const new = "new";',
      };
      const deletedFiles: string[] = [];
      const prompt = 'Test prompt';

      const result = await createModificationResult(mockProjectState, updatedFiles, deletedFiles, prompt);

      expect(result).toHaveProperty('projectState');
      expect(result.projectState).toHaveProperty('files');
      expect(result.projectState?.files['src/new.ts']).toBeDefined();
    });

    it('should return version object', async () => {
      const updatedFiles = {
        'src/new.ts': 'export const new = "new";',
      };
      const deletedFiles: string[] = [];
      const prompt = 'Test prompt';

      const result = await createModificationResult(mockProjectState, updatedFiles, deletedFiles, prompt);

      expect(result).toHaveProperty('version');
      expect(result.version).toHaveProperty('id');
      expect(result.version).toHaveProperty('projectId');
      expect(result.version).toHaveProperty('prompt');
      expect(result.version).toHaveProperty('timestamp');
      expect(result.version).toHaveProperty('files');
      expect(result.version).toHaveProperty('diffs');
      expect(result.version).toHaveProperty('parentVersionId');
    });

    it('should return diffs array', async () => {
      const updatedFiles = {
        'src/new.ts': 'export const new = "new";',
      };
      const deletedFiles: string[] = [];
      const prompt = 'Test prompt';

      const result = await createModificationResult(mockProjectState, updatedFiles, deletedFiles, prompt);

      expect(result).toHaveProperty('diffs');
      expect(Array.isArray(result.diffs)).toBe(true);
    });

    it('should return changeSummary string', async () => {
      const updatedFiles = {
        'src/new.ts': 'export const new = "new";',
      };
      const deletedFiles: string[] = [];
      const prompt = 'Test prompt';

      const result = await createModificationResult(mockProjectState, updatedFiles, deletedFiles, prompt);

      expect(result).toHaveProperty('changeSummary');
      expect(typeof result.changeSummary).toBe('string');
    });
  });

  describe('side effects', () => {
    it('should not mutate original project state', async () => {
      const updatedFiles = {
        'src/new.ts': 'export const new = "new";',
      };
      const deletedFiles: string[] = [];
      const prompt = 'Test prompt';
      const originalFiles = { ...mockProjectState.files };

      await createModificationResult(mockProjectState, updatedFiles, deletedFiles, prompt);

      expect(mockProjectState.files).toEqual(originalFiles);
    });

    it('should not mutate updatedFiles object', async () => {
      const updatedFiles = {
        'src/new.ts': 'export const new = "new";',
      };
      const deletedFiles: string[] = [];
      const prompt = 'Test prompt';
      const originalUpdatedFiles = { ...updatedFiles };

      await createModificationResult(mockProjectState, updatedFiles, deletedFiles, prompt);

      expect(updatedFiles).toEqual(originalUpdatedFiles);
    });

    it('should not mutate deletedFiles array', async () => {
      const updatedFiles: Record<string, string | null> = {};
      const deletedFiles = ['src/utils.ts'];
      const prompt = 'Test prompt';
      const originalDeletedFiles = [...deletedFiles];

      await createModificationResult(mockProjectState, updatedFiles, deletedFiles, prompt);

      expect(deletedFiles).toEqual(originalDeletedFiles);
    });
  });

  describe('version properties', () => {
    it('should set version id to generated UUID', async () => {
      const updatedFiles = {
        'src/new.ts': 'export const new = "new";',
      };
      const deletedFiles: string[] = [];
      const prompt = 'Test prompt';

      const result = await createModificationResult(mockProjectState, updatedFiles, deletedFiles, prompt);

      expect(result.version?.id).toBe('test-uuid-123');
    });

    it('should set version projectId from project state', async () => {
      const updatedFiles = {
        'src/new.ts': 'export const new = "new";',
      };
      const deletedFiles: string[] = [];
      const prompt = 'Test prompt';

      const result = await createModificationResult(mockProjectState, updatedFiles, deletedFiles, prompt);

      expect(result.version?.projectId).toBe('test-project');
    });

    it('should set version prompt from parameter', async () => {
      const updatedFiles = {
        'src/new.ts': 'export const new = "new";',
      };
      const deletedFiles: string[] = [];
      const prompt = 'Custom prompt';

      const result = await createModificationResult(mockProjectState, updatedFiles, deletedFiles, prompt);

      expect(result.version?.prompt).toBe('Custom prompt');
    });

    it('should set version parentVersionId from project state', async () => {
      const updatedFiles = {
        'src/new.ts': 'export const new = "new";',
      };
      const deletedFiles: string[] = [];
      const prompt = 'Test prompt';

      const result = await createModificationResult(mockProjectState, updatedFiles, deletedFiles, prompt);

      expect(result.version?.parentVersionId).toBe('v1');
    });

    it('should set version timestamp to current date', async () => {
      const updatedFiles = {
        'src/new.ts': 'export const new = "new";',
      };
      const deletedFiles: string[] = [];
      const prompt = 'Test prompt';
      const beforeDate = new Date();

      const result = await createModificationResult(mockProjectState, updatedFiles, deletedFiles, prompt);

      expect(result.version?.timestamp).toBeInstanceOf(Date);
      expect(result.version?.timestamp.getTime()).toBeGreaterThanOrEqual(beforeDate.getTime());
    });

    it('should update project state currentVersionId', async () => {
      const updatedFiles = {
        'src/new.ts': 'export const new = "new";',
      };
      const deletedFiles: string[] = [];
      const prompt = 'Test prompt';

      const result = await createModificationResult(mockProjectState, updatedFiles, deletedFiles, prompt);

      expect(result.projectState?.currentVersionId).toBe('test-uuid-123');
    });

    it('should update project state updatedAt timestamp', async () => {
      const updatedFiles = {
        'src/new.ts': 'export const new = "new";',
      };
      const deletedFiles: string[] = [];
      const prompt = 'Test prompt';
      const beforeDate = new Date();

      const result = await createModificationResult(mockProjectState, updatedFiles, deletedFiles, prompt);

      expect(result.projectState?.updatedAt).toBeInstanceOf(Date);
      expect(result.projectState?.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeDate.getTime());
    });
  });
});
