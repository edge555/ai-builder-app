import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIProvider } from '../../ai/ai-provider';
import { IPromptProvider } from '../prompts/prompt-provider';

// vi.hoisted ensures these mock functions are created BEFORE vi.mock hoisting runs
const mocks = vi.hoisted(() => ({
  executePhase: vi.fn(),
  selectRecipe: vi.fn(),
  buildHeuristicPlan: vi.fn(),
}));

vi.mock('../recipes/recipe-engine', () => ({
  selectRecipe: mocks.selectRecipe,
}));

vi.mock('../heuristic-plan-builder', () => ({
  buildHeuristicPlan: mocks.buildHeuristicPlan,
}));

vi.mock('../phase-executor', () => ({
  PhaseExecutor: class {
    executePhase = mocks.executePhase;
  },
}));

vi.mock('../build-validator', () => ({
  BuildValidator: class {
    validate() { return { valid: true, errors: [] }; }
    formatErrorsForAI() { return ''; }
  },
}));

import { GenerationPipeline } from '../generation-pipeline';

describe('GenerationPipeline (Phase 5)', () => {
  let mockIntentProvider: import('vitest').Mocked<AIProvider>;
  let mockPlanningProvider: import('vitest').Mocked<AIProvider>;
  let mockExecutionProvider: import('vitest').Mocked<AIProvider>;
  let mockReviewProvider: import('vitest').Mocked<AIProvider>;
  let mockBugfixProvider: import('vitest').Mocked<AIProvider>;
  let mockPromptProvider: import('vitest').Mocked<IPromptProvider>;
  let pipeline: GenerationPipeline;

  const validIntentJson = JSON.stringify({
    clarifiedGoal: 'make a simple app',
    technicalApproach: 'use react',
    complexity: 'simple',
    features: ['login'],
    projectType: 'spa'
  });

  const validPlanJson = JSON.stringify({
    files: [
      { path: 'src/main.ts', purpose: 'entry', layer: 'scaffold', exports: [], imports: [] }
    ],
    components: [], dependencies: [], routing: [],
    typeContracts: [], cssVariables: [],
    stateShape: { contexts: [], hooks: [] }
  });

  const validReviewJson = JSON.stringify({
    valid: true, issues: [],
    corrections: { filesToAdd: [], filesToRemove: [], importsToFix: [] }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executePhase.mockResolvedValue({ files: [], warnings: [] });

    mockIntentProvider = { generate: vi.fn(), generateStreaming: vi.fn() };
    mockPlanningProvider = { generate: vi.fn(), generateStreaming: vi.fn() };
    mockExecutionProvider = { generate: vi.fn(), generateStreaming: vi.fn() };
    mockReviewProvider = { generate: vi.fn(), generateStreaming: vi.fn() };
    mockBugfixProvider = { generate: vi.fn(), generateStreaming: vi.fn() };

    mockPromptProvider = {
      getIntentSystemPrompt: vi.fn().mockReturnValue('intent prompt'),
      getPlanningSystemPrompt: vi.fn(),
      getArchitecturePlanningPrompt: vi.fn().mockReturnValue('arch prompt'),
      getPlanReviewPrompt: vi.fn(),
      getExecutionGenerationSystemPrompt: vi.fn(),
      getExecutionModificationSystemPrompt: vi.fn(),
      getReviewSystemPrompt: vi.fn(),
      getBugfixSystemPrompt: vi.fn(),
      getPhasePrompt: vi.fn(),
      tokenBudgets: {
        intent: 100, planning: 100, executionGeneration: 100, 
        executionModification: 100, review: 100, bugfix: 100,
        architecturePlanning: 8192, planReview: 4096,
        scaffold: 2000, logic: 2000, ui: 2000, integration: 2000
      }
    };

    pipeline = new GenerationPipeline(
      mockIntentProvider, mockPlanningProvider, mockExecutionProvider,
      mockReviewProvider, mockBugfixProvider, mockPromptProvider
    );

    mocks.selectRecipe.mockReturnValue({ id: 'react-spa', name: 'SPA' } as any);
    mocks.buildHeuristicPlan.mockReturnValue({
      files: [{ path: 'fallback.ts', purpose: 'fallback', layer: 'ui', exports: [], imports: [] }],
      components: [], dependencies: [], routing: [], typeContracts: [], cssVariables: [],
      stateShape: { contexts: [], hooks: [] }
    });
  });

  // ── Early stages (Tasks 5.1–5.2) ───────────────────────────────────────────
  it('runs generation stages successfully to planning', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    mockPlanningProvider.generate.mockResolvedValue({ success: true, content: validPlanJson });
    mockReviewProvider.generate.mockResolvedValue({ success: true, content: validReviewJson });

    const result = await pipeline.runGeneration('make a simple app');

    expect(mockIntentProvider.generate).toHaveBeenCalledTimes(1);
    expect(mocks.selectRecipe).toHaveBeenCalled();
    expect(mockPlanningProvider.generate).toHaveBeenCalledTimes(1);
    expect(result.intentOutput?.complexity).toBe('simple');
    expect(result.architecturePlan?.files).toHaveLength(1);
  });

  it('falls back to heuristic plan if AI planning stage fails', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    mockPlanningProvider.generate.mockRejectedValue(new Error('LLM Timeout'));
    mockReviewProvider.generate.mockResolvedValue({ success: true, content: validReviewJson });

    const result = await pipeline.runGeneration('make a simple app');

    expect(mocks.buildHeuristicPlan).toHaveBeenCalled();
    expect(result.architecturePlan?.files[0].path).toBe('fallback.ts');
  });

  it('handles invalid JSON from planner by triggering fallback', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    mockPlanningProvider.generate.mockResolvedValue({ success: true, content: '{ "files": "not an array" }' });
    mockReviewProvider.generate.mockResolvedValue({ success: true, content: validReviewJson });

    const result = await pipeline.runGeneration('make a simple app');

    expect(mocks.buildHeuristicPlan).toHaveBeenCalled();
    expect(result.architecturePlan?.files[0].path).toBe('fallback.ts');
  });

  // ── Plan Review (Task 5.3) ──────────────────────────────────────────────────
  it('runs plan review and applies corrections successfully', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    mockPlanningProvider.generate.mockResolvedValue({ success: true, content: validPlanJson });
    
    const reviewJson = JSON.stringify({
      valid: false,
      issues: [{ type: 'missing_type', file: 'src/main.ts', detail: 'Missing User type' }],
      corrections: {
        filesToAdd: [{ path: 'src/types.ts', purpose: 'types', layer: 'scaffold', exports: [], imports: [] }],
        filesToRemove: ['src/main.ts'],
        importsToFix: []
      }
    });
    mockReviewProvider.generate.mockResolvedValue({ success: true, content: reviewJson });

    const result = await pipeline.runGeneration('make a simple app');

    expect(mockReviewProvider.generate).toHaveBeenCalledTimes(1);
    expect(result.architecturePlan?.files).toHaveLength(1);
    expect(result.architecturePlan?.files[0].path).toBe('src/types.ts');
  });

  it('proceeds with unreviewed plan if plan review fails', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    mockPlanningProvider.generate.mockResolvedValue({ success: true, content: validPlanJson });
    mockReviewProvider.generate.mockRejectedValue(new Error('Review Timeout'));

    const result = await pipeline.runGeneration('make a simple app');

    expect(result.architecturePlan?.files).toHaveLength(1);
    expect(result.architecturePlan?.files[0].path).toBe('src/main.ts');
  });

  // ── Complexity Gate (Task 5.4) ──────────────────────────────────────────────
  it('routes to one-shot for simple plans', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    mockPlanningProvider.generate.mockResolvedValue({ success: true, content: validPlanJson });
    mockReviewProvider.generate.mockResolvedValue({ success: true, content: validReviewJson });

    const result = await pipeline.runGeneration('make a simple app');
    expect(result.complexityRoute).toBe('one-shot');
  });

  it('routes to multi-phase for plans with > 10 files', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    const largePlan = {
      files: Array.from({ length: 11 }).map((_, i) => ({
        path: `src/f${i}.ts`, purpose: 'test', layer: 'logic', exports: [], imports: []
      })),
      components: [], dependencies: [], routing: [], typeContracts: [], cssVariables: [],
      stateShape: { contexts: [], hooks: [] }
    };
    mockPlanningProvider.generate.mockResolvedValue({ success: true, content: JSON.stringify(largePlan) });
    mockReviewProvider.generate.mockResolvedValue({ success: true, content: validReviewJson });

    const result = await pipeline.runGeneration('huge app');
    expect(result.complexityRoute).toBe('multi-phase');
  });

  // ── Phase Merge (Task 5.5) ──────────────────────────────────────────────────
  it('merges logic layer with <=1 file into UI phase', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    const plan = {
      files: [
        { path: 'src/types.ts', purpose: 'types', layer: 'scaffold', exports: [], imports: [] },
        { path: 'src/utils.ts', purpose: 'utils', layer: 'logic', exports: [], imports: [] },
        { path: 'src/App.tsx', purpose: 'app', layer: 'ui', exports: [], imports: [] },
        { path: 'src/index.tsx', purpose: 'entry', layer: 'ui', exports: [], imports: [] },
      ],
      components: [], dependencies: [], routing: [], typeContracts: [], cssVariables: [],
      stateShape: { contexts: [], hooks: [] }
    };
    mockPlanningProvider.generate.mockResolvedValue({ success: true, content: JSON.stringify(plan) });
    mockReviewProvider.generate.mockResolvedValue({ success: true, content: validReviewJson });

    await pipeline.runGeneration('test merge');

    const executedLayers = mocks.executePhase.mock.calls.map((call: any[]) => call[0].layer);
    expect(executedLayers).toContain('scaffold');
    expect(executedLayers).toContain('ui');
    expect(executedLayers).not.toContain('logic'); // merged into UI
  });

  it('keeps logic as separate phase when it has > 1 file', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    const plan = {
      files: [
        { path: 'src/types.ts', purpose: 'types', layer: 'scaffold', exports: [], imports: [] },
        { path: 'src/utils.ts', purpose: 'utils', layer: 'logic', exports: [], imports: [] },
        { path: 'src/helpers.ts', purpose: 'helpers', layer: 'logic', exports: [], imports: [] },
        { path: 'src/App.tsx', purpose: 'app', layer: 'ui', exports: [], imports: [] },
      ],
      components: [], dependencies: [], routing: [], typeContracts: [], cssVariables: [],
      stateShape: { contexts: [], hooks: [] }
    };
    mockPlanningProvider.generate.mockResolvedValue({ success: true, content: JSON.stringify(plan) });
    mockReviewProvider.generate.mockResolvedValue({ success: true, content: validReviewJson });

    await pipeline.runGeneration('test separate');

    const executedLayers = mocks.executePhase.mock.calls.map((call: any[]) => call[0].layer);
    expect(executedLayers).toContain('logic'); // kept separate
  });

  // ── Multi-Phase Execution (Task 5.6) ────────────────────────────────────────
  it('executes phases sequentially and accumulates files', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    const plan = {
      files: [
        { path: 'src/types.ts', purpose: 'types', layer: 'scaffold', exports: [], imports: [] },
        { path: 'src/App.tsx', purpose: 'app', layer: 'ui', exports: [], imports: [] },
      ],
      components: [], dependencies: [], routing: [], typeContracts: [], cssVariables: [],
      stateShape: { contexts: [], hooks: [] }
    };
    mockPlanningProvider.generate.mockResolvedValue({ success: true, content: JSON.stringify(plan) });
    mockReviewProvider.generate.mockResolvedValue({ success: true, content: validReviewJson });

    mocks.executePhase
      .mockResolvedValueOnce({ files: [{ path: 'src/types.ts', content: 'export type T = {};' }], warnings: [] })
      .mockResolvedValueOnce({ files: [{ path: 'src/App.tsx', content: 'export default function App() {}' }], warnings: [] });

    const result = await pipeline.runGeneration('test execution');

    expect(result.generatedFiles).toHaveLength(2);
    expect(result.generatedFiles.map(f => f.path)).toEqual(['src/types.ts', 'src/App.tsx']);
  });

  it('emits phase-start and phase-complete events', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    mockPlanningProvider.generate.mockResolvedValue({ success: true, content: validPlanJson });
    mockReviewProvider.generate.mockResolvedValue({ success: true, content: validReviewJson });

    const stageStarts: string[] = [];
    const stageCompletes: string[] = [];

    await pipeline.runGeneration('test events', {
      onStageStart: (stage) => stageStarts.push(stage),
      onStageComplete: (stage) => stageCompletes.push(stage),
    });

    expect(stageStarts).toContain('scaffold');
    expect(stageCompletes).toContain('scaffold');
  });
});
