import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateModifications } from '../modification-generator';
import type { ProjectState } from '@ai-app-builder/shared';
import type { CodeSlice } from '../../analysis/file-planner/types';

// Mock dependencies
vi.mock('../file-edit-applicator', () => ({
  applyFileEdits: vi.fn(async () => ({
    success: true,
    updatedFiles: {},
    deletedFiles: [],
  })),
}));

vi.mock('../prompt-builder', () => ({
  buildModificationPrompt: vi.fn(() => 'Test prompt'),
}));

vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('../../config', () => ({
  getMaxOutputTokens: vi.fn(() => 8192),
}));

vi.mock('../../core/schemas', () => ({
  ModificationOutputSchema: {
    safeParse: vi.fn(() => ({
      success: true,
      data: {
        files: [],
      },
    })),
  },
}));

vi.mock('../../utils', () => ({
  isSafePath: vi.fn(() => true),
}));

describe('generateModifications', () => {
  let mockProjectState: ProjectState;
  let mockSlices: CodeSlice[];
  let mockAIProvider: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset safeParse to default success implementation after any test that overrides it
    const { ModificationOutputSchema } = await import('../../core/schemas');
    vi.mocked(ModificationOutputSchema.safeParse).mockImplementation(() => ({
      success: true,
      data: { files: [] },
    }) as ReturnType<typeof ModificationOutputSchema.safeParse>);
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
    mockSlices = [
      {
        filePath: 'src/index.ts',
        content: 'export const foo = "bar";',
        relevance: 'primary',
      },
    ];
    mockAIProvider = {
      generate: vi.fn(),
    };
  });

  describe('happy path', () => {
    it('should generate modifications successfully on first attempt', async () => {
      const mockResponse = {
        success: true,
        content: JSON.stringify({
          files: [
            {
              path: 'src/index.ts',
              operation: 'modify',
              edits: [],
            },
          ],
        }),
      };
      mockAIProvider.generate.mockResolvedValue(mockResponse);

      const result = await generateModifications(
        'Modify index.ts',
        mockSlices,
        mockProjectState,
        false,
        mockAIProvider,
        'test-request-id'
      );

      expect(result.success).toBe(true);
      expect(result.updatedFiles).toBeDefined();
      expect(result.deletedFiles).toBeDefined();
      expect(mockAIProvider.generate).toHaveBeenCalledTimes(1);
    });

    it('should include requestId in AI provider call', async () => {
      const mockResponse = {
        success: true,
        content: JSON.stringify({
          files: [
            {
              path: 'src/index.ts',
              operation: 'modify',
              edits: [],
            },
          ],
        }),
      };
      mockAIProvider.generate.mockResolvedValue(mockResponse);

      await generateModifications(
        'Test prompt',
        mockSlices,
        mockProjectState,
        false,
        mockAIProvider,
        'custom-request-id'
      );

      expect(mockAIProvider.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'custom-request-id',
        })
      );
    });

    it('should pass correct parameters to AI provider', async () => {
      const mockResponse = {
        success: true,
        content: JSON.stringify({
          files: [
            {
              path: 'src/index.ts',
              operation: 'modify',
              edits: [],
            },
          ],
        }),
      };
      mockAIProvider.generate.mockResolvedValue(mockResponse);

      await generateModifications(
        'Test prompt',
        mockSlices,
        mockProjectState,
        true,
        mockAIProvider
      );

      expect(mockAIProvider.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
        })
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty slices array', async () => {
      const mockResponse = {
        success: true,
        content: JSON.stringify({
          files: [],
        }),
      };
      mockAIProvider.generate.mockResolvedValue(mockResponse);

      const result = await generateModifications(
        'Test prompt',
        [],
        mockProjectState,
        false,
        mockAIProvider
      );

      expect(result.success).toBe(true);
      expect(result.updatedFiles).toEqual({});
      expect(result.deletedFiles).toEqual([]);
    });

    it('should handle create operation', async () => {
      const mockResponse = {
        success: true,
        content: JSON.stringify({
          files: [
            {
              path: 'src/new.ts',
              operation: 'create',
              content: 'export const newFile = "new";',
            },
          ],
        }),
      };
      mockAIProvider.generate.mockResolvedValue(mockResponse);

      const result = await generateModifications(
        'Create new file',
        mockSlices,
        mockProjectState,
        false,
        mockAIProvider
      );

      expect(result.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should return error after max retries', async () => {
      // With the new retry strategy, retries 2-4 only trigger when there are
      // failed file edits. A raw API failure on attempt 1 exits immediately.
      mockAIProvider.generate.mockResolvedValue({
        success: false,
        error: 'Persistent error',
      });

      const result = await generateModifications(
        'Test prompt',
        mockSlices,
        mockProjectState,
        false,
        mockAIProvider
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed after 3 attempts');
      expect(mockAIProvider.generate).toHaveBeenCalledTimes(1);
    });

    it('should return error when AI returns success but no content', async () => {
      mockAIProvider.generate.mockResolvedValue({
        success: true,
        content: undefined,
      });

      const result = await generateModifications(
        'Test prompt',
        mockSlices,
        mockProjectState,
        false,
        mockAIProvider
      );

      expect(result.success).toBe(false);
    });

    it('should return error when AI returns success but false', async () => {
      mockAIProvider.generate.mockResolvedValue({
        success: false,
        error: 'AI generation failed',
      });

      const result = await generateModifications(
        'Test prompt',
        mockSlices,
        mockProjectState,
        false,
        mockAIProvider
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('AI generation failed');
    });

    it('should return error on schema validation failure', async () => {
      const { ModificationOutputSchema } = await import('../../core/schemas');
      vi.mocked(ModificationOutputSchema.safeParse).mockReturnValue({
        success: false,
        error: {
          issues: [{ message: 'Schema validation failed' }],
          message: 'Schema validation failed',
        },
      } as ReturnType<typeof ModificationOutputSchema.safeParse>);

      const mockResponse = {
        success: true,
        content: JSON.stringify({
          invalid: 'schema',
        }),
      };
      mockAIProvider.generate.mockResolvedValue(mockResponse);

      const result = await generateModifications(
        'Test prompt',
        mockSlices,
        mockProjectState,
        false,
        mockAIProvider
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Schema validation failed');
    });
  });

  describe('return value shape', () => {
    it('should return object with success boolean', async () => {
      const mockResponse = {
        success: true,
        content: JSON.stringify({
          files: [
            {
              path: 'src/index.ts',
              operation: 'modify',
              edits: [],
            },
          ],
        }),
      };
      mockAIProvider.generate.mockResolvedValue(mockResponse);

      const result = await generateModifications(
        'Test prompt',
        mockSlices,
        mockProjectState,
        false,
        mockAIProvider
      );

      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
    });

    it('should return error string when failed', async () => {
      mockAIProvider.generate.mockResolvedValue({
        success: false,
        error: 'Test error',
      });

      const result = await generateModifications(
        'Test prompt',
        mockSlices,
        mockProjectState,
        false,
        mockAIProvider
      );

      expect(result).toHaveProperty('error');
      expect(typeof result.error).toBe('string');
    });

    it('should return updatedFiles and deletedFiles when successful', async () => {
      const mockResponse = {
        success: true,
        content: JSON.stringify({
          files: [
            {
              path: 'src/index.ts',
              operation: 'modify',
              edits: [],
            },
          ],
        }),
      };
      mockAIProvider.generate.mockResolvedValue(mockResponse);

      const result = await generateModifications(
        'Test prompt',
        mockSlices,
        mockProjectState,
        false,
        mockAIProvider
      );

      expect(result).toHaveProperty('updatedFiles');
      expect(result).toHaveProperty('deletedFiles');
      expect(typeof result.updatedFiles).toBe('object');
      expect(Array.isArray(result.deletedFiles)).toBe(true);
    });
  });

  describe('side effects', () => {
    it('should not mutate project state', async () => {
      const mockResponse = {
        success: true,
        content: JSON.stringify({
          files: [
            {
              path: 'src/index.ts',
              operation: 'modify',
              edits: [],
            },
          ],
        }),
      };
      mockAIProvider.generate.mockResolvedValue(mockResponse);
      const originalFiles = { ...mockProjectState.files };

      await generateModifications(
        'Test prompt',
        mockSlices,
        mockProjectState,
        false,
        mockAIProvider
      );

      expect(mockProjectState.files).toEqual(originalFiles);
    });

    it('should not mutate slices array', async () => {
      const mockResponse = {
        success: true,
        content: JSON.stringify({
          files: [
            {
              path: 'src/index.ts',
              operation: 'modify',
              edits: [],
            },
          ],
        }),
      };
      mockAIProvider.generate.mockResolvedValue(mockResponse);
      const originalSlices = JSON.parse(JSON.stringify(mockSlices));

      await generateModifications(
        'Test prompt',
        mockSlices,
        mockProjectState,
        false,
        mockAIProvider
      );

      expect(mockSlices).toEqual(originalSlices);
    });
  });
});
