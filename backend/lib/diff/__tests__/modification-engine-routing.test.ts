import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModificationEngine } from '../modification-engine';
import { applyFileEdits } from '../file-edit-applicator';
import { ProjectState } from '@ai-app-builder/shared';

// Mock config
vi.mock('../../config', () => ({
  config: {
    OPENROUTER_API_KEY: 'test',
    ANTHROPIC_API_KEY: 'test',
    NODE_ENV: 'test',
  }
}));

// Mock dependencies
vi.mock('../../core/pipeline-orchestrator', () => ({
  PipelineOrchestrator: vi.fn(),
  createPipelineOrchestrator: () => Promise.resolve({
    runModificationPipeline: vi.fn(),
    runOrderedModificationPipeline: vi.fn(),
  }),
}));
vi.mock('../../ai', () => ({
  createAIProvider: () => Promise.resolve({}),
}));
vi.mock('../../core/prompts/prompt-provider-factory', () => ({
  createPromptProvider: () => ({}),
}));
vi.mock('../../ai/provider-config-store', () => ({
  getEffectiveProvider: () => Promise.resolve('test-provider'),
}));
vi.mock('../checkpoint-manager', () => ({
  CheckpointManager: class {
    capture() {}
    rollbackAll() { return []; }
  }
}));
vi.mock('../diagnostic-repair-engine', () => ({
  DiagnosticRepairEngine: class {
    async repair() {
      return {
        success: true,
        repairLevel: 'deterministic',
        totalAICalls: 0,
        updatedFiles: {},
        rolledBackFiles: [],
      };
    }
  }
}));
vi.mock('../file-edit-applicator', () => ({
  applyFileEdits: vi.fn(),
}));
vi.mock('../../analysis', () => ({
  createFilePlanner: () => ({
    planWithCategory: () => Promise.resolve({ slices: [], category: 'mixed' }),
  }),
  FilePlanner: vi.fn(),
  TokenBudgetManager: vi.fn().mockImplementation(() => ({
    trimToFit: (slices: any) => slices,
  })),
}));

describe('ModificationEngine Routing', () => {
  let pipelineMock: any;
  let engine: ModificationEngine;

  beforeEach(() => {
    pipelineMock = {
      runModificationPipeline: vi.fn().mockResolvedValue({
        finalFiles: [],
        executorFiles: [],
      }),
      runOrderedModificationPipeline: vi.fn().mockResolvedValue({
        finalFiles: [],
        executorFiles: [],
      }),
    };
    engine = new ModificationEngine(pipelineMock, {} as any, {} as any);
    
    // Mock the slice selector to just return all files for simplicity
    (engine as any).selectCodeSlices = vi.fn().mockImplementation(async (state: any) => {
      const slices = Object.keys(state.files).map(filePath => ({
        filePath,
        content: state.files[filePath],
        relevance: 'primary'
      }));
      return { slices, category: 'logic' };
    });
    
    // Mock validation to always pass
    (engine as any).validateModifiedFiles = vi.fn().mockResolvedValue({ valid: true, errors: [] });
    (engine as any).buildValidator.validateCrossFileReferences = vi.fn().mockReturnValue([]);
  });

  it('routes to single-shot pipeline when filesToModify <= 3', async () => {
    const projectState: ProjectState = {
      files: {
        'A.ts': 'content A',
        'B.ts': 'content B',
        'C.ts': 'content C',
      },
    } as unknown as ProjectState;

    await engine.modifyProject(projectState, 'test prompt');

    expect(pipelineMock.runModificationPipeline).toHaveBeenCalled();
    expect(pipelineMock.runOrderedModificationPipeline).not.toHaveBeenCalled();
  });

  it('routes to ordered execution pipeline when filesToModify > 3', async () => {
    const projectState: ProjectState = {
      files: {
        'A.ts': 'content A',
        'B.ts': 'content B',
        'C.ts': 'content C',
        'D.ts': 'content D',
      },
    } as unknown as ProjectState;

    await engine.modifyProject(projectState, 'test prompt');

    expect(pipelineMock.runOrderedModificationPipeline).toHaveBeenCalled();
    expect(pipelineMock.runModificationPipeline).not.toHaveBeenCalled();
  });

  describe('replace_file fallback', () => {
    let bugfixProviderMock: any;
    let promptProviderMock: any;
    let fallbackEngine: ModificationEngine;

    const modifyOpExecutorFiles = [
      {
        path: 'src/index.ts',
        content: JSON.stringify({
          operation: 'modify',
          path: 'src/index.ts',
          edits: [{ search: 'NOT FOUND', replace: 'new content' }],
        }),
      },
    ];

    const failedFileEdits = [
      {
        path: 'src/index.ts',
        originalContent: 'original content',
        failedEdits: [
          {
            editIndex: 0,
            error: 'Search string not found',
            edit: { search: 'NOT FOUND', replace: 'new content' },
          },
        ],
      },
    ];

    beforeEach(() => {
      bugfixProviderMock = { generate: vi.fn() };
      promptProviderMock = {
        getExecutionModificationSystemPrompt: vi.fn().mockReturnValue('system prompt'),
        tokenBudgets: { executionModification: 16384 },
      };
      fallbackEngine = new ModificationEngine(pipelineMock, bugfixProviderMock, promptProviderMock);

      vi.mocked(applyFileEdits).mockResolvedValue({
        success: false,
        updatedFiles: {},
        deletedFiles: [],
        failedFileEdits,
      } as any);
    });

    it('triggers when search/replace fails — bugfix provider is called', async () => {
      bugfixProviderMock.generate.mockResolvedValue({
        success: true,
        content: JSON.stringify({ files: [{ path: 'src/index.ts', content: 'recovered' }] }),
      });

      await (fallbackEngine as any).resolveModifications(
        { 'src/index.ts': 'original content' },
        { finalFiles: [], executorFiles: modifyOpExecutorFiles },
        { userPrompt: 'test prompt', designSystem: false }
      );

      expect(bugfixProviderMock.generate).toHaveBeenCalled();
    });

    it('succeeds → recovered file content is in updatedFiles', async () => {
      bugfixProviderMock.generate.mockResolvedValue({
        success: true,
        content: JSON.stringify({ files: [{ path: 'src/index.ts', content: 'recovered content' }] }),
      });

      const result = await (fallbackEngine as any).resolveModifications(
        { 'src/index.ts': 'original content' },
        { finalFiles: [], executorFiles: modifyOpExecutorFiles },
        { userPrompt: 'test prompt', designSystem: false }
      );

      expect(result.updatedFiles['src/index.ts']).toBe('recovered content');
    });

    it('fails → file is not recovered', async () => {
      bugfixProviderMock.generate.mockResolvedValue({ success: false, error: 'AI failed' });

      const result = await (fallbackEngine as any).resolveModifications(
        { 'src/index.ts': 'original content' },
        { finalFiles: [], executorFiles: modifyOpExecutorFiles },
        { userPrompt: 'test prompt', designSystem: false }
      );

      // Fallback was attempted but failed
      expect(bugfixProviderMock.generate).toHaveBeenCalled();
      // File was not recovered — treated as missing (null)
      expect(result.updatedFiles['src/index.ts']).toBeNull();
    });
  });
});
