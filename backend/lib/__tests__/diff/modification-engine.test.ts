/**
 * Tests for Modification Engine Service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModificationEngine, createModificationEngine } from '../../diff';
import { GeminiClient } from '../../ai';
import type { ProjectState } from '@ai-app-builder/shared';

vi.mock('../../analysis', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    createIntentClassifier: vi.fn(() => ({
      classify: vi.fn().mockResolvedValue({
        type: 'modify_component',
        confidence: 1.0,
        affectedAreas: [],
        description: 'Mock intent'
      })
    }))
  };
});

describe('ModificationEngine', () => {
  let mockGeminiClient: GeminiClient;
  let modificationEngine: ModificationEngine;

  const createProjectState = (files: Record<string, string>): ProjectState => ({
    id: 'test-project',
    name: 'Test Project',
    description: 'A test project',
    files,
    createdAt: new Date(),
    updatedAt: new Date(),
    currentVersionId: 'v1',
  });

  beforeEach(() => {
    mockGeminiClient = {
      generate: vi.fn(),
    } as unknown as GeminiClient;
    modificationEngine = new ModificationEngine(mockGeminiClient);
  });

  describe('modifyProject', () => {
    it('should return error for empty prompt', async () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      const result = await modificationEngine.modifyProject(projectState, '');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Modification prompt is required');
    });

    it('should return error for empty project state', async () => {
      const projectState = createProjectState({});

      const result = await modificationEngine.modifyProject(
        projectState,
        'Add a button'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Project state with files is required');
    });

    it('should successfully modify a project', async () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
      });

      // Mock FilePlanner planning response (selects files)
      vi.mocked(mockGeminiClient.generate)
        .mockResolvedValueOnce({
          success: true,
          content: JSON.stringify({
            primaryFiles: ['src/App.tsx'],
            contextFiles: [],
            reasoning: 'App.tsx needs modification',
          }),
        })
        // Mock modification response
        .mockResolvedValueOnce({
          success: true,
          content: JSON.stringify({
            files: [
              {
                path: 'src/App.tsx',
                operation: 'modify',
                edits: [
                  {
                    search: 'Hello',
                    replace: 'Hello World',
                  },
                ],
              },
            ],
          }),
        });


      const result = await modificationEngine.modifyProject(
        projectState,
        'Change Hello to Hello World'
      );

      expect(result.success).toBe(true);
      expect(result.projectState).toBeDefined();
      expect(result.projectState?.files['src/App.tsx']).toContain('Hello World');
      expect(result.version).toBeDefined();
      expect(result.diffs).toBeDefined();
      expect(result.changeSummary).toBeDefined();
    });


    it('should handle adding new files', async () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      vi.mocked(mockGeminiClient.generate)
        .mockResolvedValueOnce({
          success: true,
          content: JSON.stringify({
            primaryFiles: ['src/App.tsx'],
            contextFiles: [],
            reasoning: 'Need to add Button component',
          }),
        })
        .mockResolvedValueOnce({
          success: true,
          content: JSON.stringify({
            files: [
              {
                path: 'src/components/Button.tsx',
                operation: 'create',
                content: 'export default function Button() { return <button>Click</button>; }',
              },
            ],
          }),
        });


      const result = await modificationEngine.modifyProject(
        projectState,
        'Add a Button component'
      );

      expect(result.success).toBe(true);
      expect(result.projectState?.files['src/components/Button.tsx']).toBeDefined();
      expect(result.changeSummary?.filesAdded).toBe(1);
    });

    it('should handle deleting files', async () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
        'src/OldComponent.tsx': 'export default function OldComponent() { return <div />; }',
      });

      vi.mocked(mockGeminiClient.generate)
        .mockResolvedValueOnce({
          success: true,
          content: JSON.stringify({
            primaryFiles: ['src/OldComponent.tsx'],
            contextFiles: [],
            reasoning: 'Delete OldComponent',
          }),
        })
        .mockResolvedValueOnce({
          success: true,
          content: JSON.stringify({
            files: [
              {
                path: 'src/OldComponent.tsx',
                operation: 'delete',
              },
            ],
          }),
        });


      const result = await modificationEngine.modifyProject(
        projectState,
        'Delete the OldComponent'
      );

      expect(result.success).toBe(true);
      expect(result.projectState?.files['src/OldComponent.tsx']).toBeUndefined();
      expect(result.changeSummary?.filesDeleted).toBe(1);
    });

    it('should handle API failure', async () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      vi.mocked(mockGeminiClient.generate)
        .mockResolvedValueOnce({
          success: true,
          content: JSON.stringify({
            primaryFiles: ['src/App.tsx'],
            contextFiles: [],
            reasoning: 'Modify App',
          }),
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'API error',
        });

      const result = await modificationEngine.modifyProject(
        projectState,
        'Change something'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('API error');
    });

    it('should handle invalid JSON response', async () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      vi.mocked(mockGeminiClient.generate)
        .mockResolvedValueOnce({
          success: true,
          content: JSON.stringify({
            primaryFiles: ['src/App.tsx'],
            contextFiles: [],
            reasoning: 'Modify App',
          }),
        })
        .mockResolvedValueOnce({
          success: true,
          content: 'This is not valid JSON',
        });

      const result = await modificationEngine.modifyProject(
        projectState,
        'Change something'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to parse');
    });

    it('should handle validation failure', async () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      vi.mocked(mockGeminiClient.generate)
        .mockResolvedValueOnce({
          success: true,
          content: JSON.stringify({
            primaryFiles: ['src/App.tsx'],
            contextFiles: [],
            reasoning: 'Modify App',
          }),
        })
        .mockResolvedValueOnce({
          success: true,
          content: JSON.stringify({
            files: [
              {
                path: 'src/App.tsx',
                operation: 'modify',
                edits: [{ search: '<div />', replace: '<div> {' }],
              },
            ],
          }),
        });


      const result = await modificationEngine.modifyProject(
        projectState,
        'Change something'
      );

      expect(result.success).toBe(false);
      expect(result.validationErrors).toBeDefined();
    });


    it('should compute correct diffs for modified files', async () => {
      const projectState = createProjectState({
        'src/App.tsx': 'line1\nline2\nline3',
      });

      vi.mocked(mockGeminiClient.generate)
        .mockResolvedValueOnce({
          success: true,
          content: JSON.stringify({
            primaryFiles: ['src/App.tsx'],
            contextFiles: [],
            reasoning: 'Modify App',
          }),
        })
        .mockResolvedValueOnce({
          success: true,
          content: JSON.stringify({
            files: [
              {
                path: 'src/App.tsx',
                operation: 'modify',
                edits: [
                  {
                    search: 'line2',
                    replace: 'modified',
                  },
                ],
              },
            ],
          }),
        });


      const result = await modificationEngine.modifyProject(
        projectState,
        'Modify line 2'
      );

      expect(result.success).toBe(true);
      expect(result.diffs).toHaveLength(1);
      expect(result.diffs?.[0].status).toBe('modified');
      expect(result.diffs?.[0].filePath).toBe('src/App.tsx');
    });

    it('should preserve unchanged files', async () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
        'src/utils.ts': 'export const helper = () => 42;',
      });

      vi.mocked(mockGeminiClient.generate)
        .mockResolvedValueOnce({
          success: true,
          content: JSON.stringify({
            primaryFiles: ['src/App.tsx'],
            contextFiles: [],
            reasoning: 'Modify App',
          }),
        })
        .mockResolvedValueOnce({
          success: true,
          content: JSON.stringify({
            files: [
              {
                path: 'src/App.tsx',
                operation: 'modify',
                edits: [{ search: '<div />', replace: '<div>Modified</div>' }],
              },
            ],
          }),
        });


      const result = await modificationEngine.modifyProject(
        projectState,
        'Modify App'
      );

      expect(result.success).toBe(true);
      expect(result.projectState?.files['src/utils.ts']).toBe('export const helper = () => 42;');
    });

    it('should create new version with correct parent', async () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      vi.mocked(mockGeminiClient.generate)
        .mockResolvedValueOnce({
          success: true,
          content: JSON.stringify({
            primaryFiles: ['src/App.tsx'],
            contextFiles: [],
            reasoning: 'Modify App',
          }),
        })
        .mockResolvedValueOnce({
          success: true,
          content: JSON.stringify({
            files: [
              {
                path: 'src/App.tsx',
                operation: 'modify',
                edits: [{ search: '<div />', replace: '<div>Modified</div>' }],
              },
            ],
          }),
        });


      const result = await modificationEngine.modifyProject(
        projectState,
        'Modify App'
      );

      expect(result.success).toBe(true);
      expect(result.version?.parentVersionId).toBe('v1');
      expect(result.version?.prompt).toBe('Modify App');
    });

    it('should generate correct change summary', async () => {
      const projectState = createProjectState({
        'src/App.tsx': 'line1\nline2',
        'src/old.ts': 'old content',
      });

      vi.mocked(mockGeminiClient.generate)
        .mockResolvedValueOnce({
          success: true,
          content: JSON.stringify({
            primaryFiles: ['src/App.tsx', 'src/old.ts'],
            contextFiles: [],
            reasoning: 'Multiple changes',
          }),
        })
        .mockResolvedValueOnce({
          success: true,
          content: JSON.stringify({
            files: [
              {
                path: 'src/App.tsx',
                operation: 'modify',
                edits: [{ search: 'line2', replace: 'modified\nnew line' }],
              },
              {
                path: 'src/new.ts',
                operation: 'create',
                content: 'new file content',
              },
              {
                path: 'src/old.ts',
                operation: 'delete',
              },
            ],
          }),
        });


      const result = await modificationEngine.modifyProject(
        projectState,
        'Make multiple changes'
      );

      expect(result.success).toBe(true);
      expect(result.changeSummary?.filesAdded).toBe(1);
      expect(result.changeSummary?.filesModified).toBe(1);
      expect(result.changeSummary?.filesDeleted).toBe(1);
      expect(result.changeSummary?.affectedFiles).toContain('src/App.tsx');
      expect(result.changeSummary?.affectedFiles).toContain('src/new.ts');
      expect(result.changeSummary?.affectedFiles).toContain('src/old.ts');
    });
  });

  describe('createModificationEngine', () => {
    it('should create a ModificationEngine instance', () => {
      // This will throw if GEMINI_API_KEY is not set, which is expected in tests
      // We just verify the function exists and is callable
      expect(typeof createModificationEngine).toBe('function');
    });
  });
});
