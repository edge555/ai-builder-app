import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModificationEngine } from '../modification-engine';
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
});
