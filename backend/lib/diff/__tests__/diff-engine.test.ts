import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiffEngine, getDiffEngine, createDiffEngine } from '../diff-engine';
import type { ProjectState } from '@ai-app-builder/shared';

// Mock logger
vi.mock('../../logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
  }),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock shared package functions
vi.mock('@ai-app-builder/shared', () => ({
  computeDiffs: vi.fn(() => []),
  computeDiffsFromFiles: vi.fn(() => []),
}));

describe('DiffEngine', () => {
  let mockProjectState: ProjectState;
  let diffEngine: DiffEngine;

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
    diffEngine = new DiffEngine();
  });

  describe('computeDiffs', () => {
    it('should compute diffs between two project states', () => {
      const newState: ProjectState = {
        ...mockProjectState,
        files: {
          ...mockProjectState.files,
          'src/index.ts': 'export const foo = "modified";',
        },
      };

      const result = diffEngine.computeDiffs(mockProjectState, newState);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle null old state for initial version', () => {
      const result = diffEngine.computeDiffs(null, mockProjectState);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should log debug information', async () => {
      const { logger: mockLogger } = await import('../../logger');

      const newState: ProjectState = {
        ...mockProjectState,
        files: {
          ...mockProjectState.files,
          'src/index.ts': 'export const foo = "modified";',
        },
      };

      diffEngine.computeDiffs(mockProjectState, newState);

      expect(mockLogger.debug).toHaveBeenCalled();
    });
  });

  describe('computeDiffsFromFiles', () => {
    it('should compute diffs between two file maps', () => {
      const oldFiles = {
        'src/index.ts': 'export const foo = "bar";',
        'src/utils.ts': 'export const utils = {};',
      };
      const newFiles = {
        'src/index.ts': 'export const foo = "modified";',
        'src/utils.ts': 'export const utils = {};',
      };

      const result = diffEngine.computeDiffsFromFiles(oldFiles, newFiles);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle empty old files', () => {
      const oldFiles: Record<string, string> = {};
      const newFiles = {
        'src/index.ts': 'export const foo = "bar";',
      };

      const result = diffEngine.computeDiffsFromFiles(oldFiles, newFiles);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle empty new files', () => {
      const oldFiles = {
        'src/index.ts': 'export const foo = "bar";',
      };
      const newFiles: Record<string, string> = {};

      const result = diffEngine.computeDiffsFromFiles(oldFiles, newFiles);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getDiffEngine', () => {
    it('should return singleton instance', () => {
      const instance1 = getDiffEngine();
      const instance2 = getDiffEngine();

      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(DiffEngine);
    });
  });

  describe('createDiffEngine', () => {
    it('should create new instance', () => {
      const instance = createDiffEngine();

      expect(instance).toBeInstanceOf(DiffEngine);
    });

    it('should create different instances', () => {
      const instance1 = createDiffEngine();
      const instance2 = createDiffEngine();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('side effects', () => {
    it('should not mutate input project state', () => {
      const originalFiles = { ...mockProjectState.files };
      const newState: ProjectState = {
        ...mockProjectState,
        files: {
          ...mockProjectState.files,
          'src/index.ts': 'export const foo = "modified";',
        },
      };

      diffEngine.computeDiffs(mockProjectState, newState);

      expect(mockProjectState.files).toEqual(originalFiles);
    });
  });
});
