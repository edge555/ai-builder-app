import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIProvider } from '../../ai/ai-provider';
import { IPromptProvider } from '../prompts/prompt-provider';

// vi.hoisted ensures these mock functions are created BEFORE vi.mock hoisting runs
const mocks = vi.hoisted(() => ({
  executePhase: vi.fn(),
  selectRecipe: vi.fn(),
}));

vi.mock('../recipes/recipe-engine', () => ({
  selectRecipe: mocks.selectRecipe,
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
    // Return a realistic result: at least the files explicitly expected for the phase.
    mocks.executePhase.mockImplementation(async (phaseDef: any) => {
      const expectedFiles = phaseDef.expectedFiles ?? [];
      const files = expectedFiles.length > 0
        ? expectedFiles.map((p: string) => ({ path: p, content: `// ${p}` }))
        : (phaseDef.plan?.files ?? [])
            .filter((f: any) => f.layer === phaseDef.layer)
            .map((f: any) => ({ path: f.path, content: `// ${f.path}` }));
      return { files, warnings: [] };
    });

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
        scaffold: 2000, logic: 2000, ui: 2000, integration: 2000, oneshot: 2000
      }
    };

    pipeline = new GenerationPipeline(
      mockIntentProvider, mockPlanningProvider, mockExecutionProvider,
      mockReviewProvider, mockBugfixProvider, mockPromptProvider
    );

    mocks.selectRecipe.mockReturnValue({ id: 'react-spa', name: 'SPA' } as any);
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

  it('retries planning once and then falls back to heuristic plan if planning keeps failing', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    mockPlanningProvider.generate.mockRejectedValue(new Error('LLM Timeout'));
    mockReviewProvider.generate.mockResolvedValue({ success: true, content: validReviewJson });

    const result = await pipeline.runGeneration('make a simple app');

    expect(result.architecturePlan?.files.length).toBeGreaterThanOrEqual(4);
    expect(mockPlanningProvider.generate).toHaveBeenCalledTimes(2);
  });

  it('retries planning once and then falls back on invalid planner JSON', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    mockPlanningProvider.generate.mockResolvedValue({ success: true, content: '{ "files": "not an array" }' });
    mockReviewProvider.generate.mockResolvedValue({ success: true, content: validReviewJson });

    const result = await pipeline.runGeneration('make a simple app');
    expect(result.architecturePlan?.files.length).toBeGreaterThanOrEqual(4);
    expect(mockPlanningProvider.generate).toHaveBeenCalledTimes(2);
  });

  it('planner failure fallback preserves non-beginner fullstack recipe architecture', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    mockPlanningProvider.generate.mockRejectedValue(new Error('planner timeout'));
    mocks.selectRecipe.mockReturnValue({
      id: 'nextjs-prisma',
      name: 'Next.js + Prisma',
      defaultDependencies: ['next', 'react', 'react-dom', 'prisma', '@prisma/client'],
    } as any);

    const result = await pipeline.runGeneration('build a fullstack inventory app');
    const filePaths = result.architecturePlan?.files.map((file) => file.path) ?? [];

    expect(filePaths).toContain('app/page.tsx');
    expect(filePaths).toContain('prisma/schema.prisma');
    expect(filePaths).not.toContain('src/main.tsx');
  });

  it('beginnerMode bypasses AI planning and forces beginner recipe selection', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    mockReviewProvider.generate.mockResolvedValue({ success: true, content: validReviewJson });

    mocks.selectRecipe.mockReturnValue({ id: 'react-spa-beginner', name: 'Beginner' } as any);

    const result = await pipeline.runGeneration('make a counter app', {}, { beginnerMode: true });

    expect(mockPlanningProvider.generate).not.toHaveBeenCalled();
    expect(mocks.selectRecipe).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ beginnerMode: true }),
      expect.any(String)
    );
    expect(result.selectedRecipeId).toBe('react-spa-beginner');
    expect(result.architecturePlan?.files.length).toBeGreaterThanOrEqual(4);
    expect(result.architecturePlan?.files.length).toBeLessThanOrEqual(6);
  });

  // ── Plan Review (Task 5.3) ──────────────────────────────────────────────────

  // Large plan (>10 files) used by plan review tests
  const largePlanJson = JSON.stringify({
    files: Array.from({ length: 11 }, (_, i) => ({
      path: `src/f${i}.ts`, purpose: 'test', layer: 'logic', exports: [], imports: []
    })),
    components: [], dependencies: [], routing: [], typeContracts: [], cssVariables: [],
    stateShape: { contexts: [], hooks: [] }
  });

  it('runs plan review and applies corrections successfully', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    mockPlanningProvider.generate.mockResolvedValue({ success: true, content: largePlanJson });

    const reviewJson = JSON.stringify({
      valid: false,
      issues: [{ type: 'missing_type', file: 'src/f0.ts', detail: 'Missing User type' }],
      corrections: {
        filesToAdd: [{ path: 'src/types.ts', purpose: 'types', layer: 'scaffold', exports: [], imports: [] }],
        filesToRemove: ['src/f0.ts'],
        importsToFix: []
      }
    });
    mockReviewProvider.generate.mockResolvedValue({ success: true, content: reviewJson });

    const result = await pipeline.runGeneration('make a simple app');

    expect(mockReviewProvider.generate).toHaveBeenCalledTimes(1);
    expect(result.architecturePlan?.files.some(f => f.path === 'src/types.ts')).toBe(true);
    expect(result.architecturePlan?.files.some(f => f.path === 'src/f0.ts')).toBe(false);
  });

  it('proceeds with unreviewed plan if plan review fails', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    mockPlanningProvider.generate.mockResolvedValue({ success: true, content: largePlanJson });
    mockReviewProvider.generate.mockRejectedValue(new Error('Review Timeout'));

    const result = await pipeline.runGeneration('make a simple app');

    expect(result.architecturePlan?.files).toHaveLength(11);
  });

  it('skips plan review (no AI call) for plans with <=10 files', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    mockPlanningProvider.generate.mockResolvedValue({ success: true, content: validPlanJson }); // 1 file

    await pipeline.runGeneration('make a simple app');

    expect(mockReviewProvider.generate).not.toHaveBeenCalled();
  });

  it('calls plan review for plans with >10 files', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    mockPlanningProvider.generate.mockResolvedValue({ success: true, content: largePlanJson }); // 11 files
    mockReviewProvider.generate.mockResolvedValue({ success: true, content: validReviewJson });

    await pipeline.runGeneration('make a complex app');

    expect(mockReviewProvider.generate).toHaveBeenCalledTimes(1);
  });

  it('fires onStageStart and onStageComplete for review even when skipped', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    mockPlanningProvider.generate.mockResolvedValue({ success: true, content: validPlanJson }); // 1 file — skips review

    const stageStarts: string[] = [];
    const stageCompletes: string[] = [];

    await pipeline.runGeneration('simple app', {
      onStageStart: (stage) => stageStarts.push(stage),
      onStageComplete: (stage) => stageCompletes.push(stage),
    });

    expect(stageStarts).toContain('review');
    expect(stageCompletes).toContain('review');
    // onStageComplete must never fire without a prior onStageStart
    const reviewStartIdx = stageStarts.indexOf('review');
    const reviewCompleteIdx = stageCompletes.indexOf('review');
    expect(reviewStartIdx).toBeGreaterThanOrEqual(0);
    expect(reviewCompleteIdx).toBeGreaterThanOrEqual(0);
  });

  // ── Planning fires immediately after intent (Phase 3) ──────────────────────
  it('passes full intent output to planning after intent resolves', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    mockPlanningProvider.generate.mockResolvedValue({ success: true, content: validPlanJson });

    await pipeline.runGeneration('test intent to planning');

    expect(mockPromptProvider.getArchitecturePlanningPrompt).toHaveBeenCalledWith(
      'test intent to planning',
      expect.objectContaining({ complexity: 'simple' })
    );
    expect(mockPlanningProvider.generate).toHaveBeenCalledTimes(1);
  });

  it('abort signal after intent prevents planning call', async () => {
    const controller = new AbortController();
    mockIntentProvider.generate.mockImplementation(async () => {
      controller.abort();
      return { success: true, content: validIntentJson };
    });

    await expect(
      pipeline.runGeneration('test abort', { signal: controller.signal })
    ).rejects.toThrow('Generation cancelled by client');

    expect(mockPlanningProvider.generate).not.toHaveBeenCalled();
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
  it('merges logic layer with <=1 file into UI phase (multi-phase route)', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    // Use >10 files to force multi-phase route: 1 scaffold + 1 logic + 9 ui = 11
    const plan = {
      files: [
        { path: 'src/types.ts', purpose: 'types', layer: 'scaffold', exports: [], imports: [] },
        { path: 'src/utils.ts', purpose: 'utils', layer: 'logic', exports: [], imports: [] },
        ...Array.from({ length: 9 }, (_, i) => ({
          path: `src/Comp${i}.tsx`, purpose: `comp${i}`, layer: 'ui', exports: [], imports: []
        })),
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

  it('keeps logic as separate phase when it has > 1 file (multi-phase route)', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    // Use >10 files to force multi-phase route: 1 scaffold + 2 logic + 8 ui = 11
    const plan = {
      files: [
        { path: 'src/types.ts', purpose: 'types', layer: 'scaffold', exports: [], imports: [] },
        { path: 'src/utils.ts', purpose: 'utils', layer: 'logic', exports: [], imports: [] },
        { path: 'src/helpers.ts', purpose: 'helpers', layer: 'logic', exports: [], imports: [] },
        ...Array.from({ length: 8 }, (_, i) => ({
          path: `src/Comp${i}.tsx`, purpose: `comp${i}`, layer: 'ui', exports: [], imports: []
        })),
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

  // ── Phase 5: True One-Shot Execution ──────────────────────────────────────
  it('calls executePhase exactly once with layer oneshot for plans with <=10 files', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    mockPlanningProvider.generate.mockResolvedValue({ success: true, content: validPlanJson }); // 1 file

    await pipeline.runGeneration('simple app');

    expect(mocks.executePhase).toHaveBeenCalledTimes(1);
    expect(mocks.executePhase).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'oneshot' }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('uses multi-phase path (no oneshot call) for plans with >10 files', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    mockPlanningProvider.generate.mockResolvedValue({ success: true, content: largePlanJson }); // 11 files
    mockReviewProvider.generate.mockResolvedValue({ success: true, content: validReviewJson });

    const result = await pipeline.runGeneration('complex app');

    const calledLayers = mocks.executePhase.mock.calls.map((c: any[]) => c[0].layer);
    expect(calledLayers).not.toContain('oneshot');
    expect(result.complexityRoute).toBe('multi-phase');
  });

  it('passes all plan file paths as expectedFiles in oneshot PhaseDefinition', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    const plan = {
      files: [
        { path: 'src/main.ts', purpose: 'entry', layer: 'scaffold', exports: [], imports: [] },
        { path: 'src/App.tsx', purpose: 'app', layer: 'ui', exports: [], imports: [] },
      ],
      components: [], dependencies: [], routing: [], typeContracts: [], cssVariables: [],
      stateShape: { contexts: [], hooks: [] }
    };
    mockPlanningProvider.generate.mockResolvedValue({ success: true, content: JSON.stringify(plan) });

    await pipeline.runGeneration('simple app');

    expect(mocks.executePhase).toHaveBeenCalledWith(
      expect.objectContaining({
        layer: 'oneshot',
        expectedFiles: ['src/main.ts', 'src/App.tsx'],
      }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  // ── Multi-Phase Execution (Task 5.6) ────────────────────────────────────────
  it('one-shot calls executePhase once and collects all files', async () => {
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

    // One-shot: single call returns all files
    mocks.executePhase.mockResolvedValueOnce({
      files: [
        { path: 'src/types.ts', content: 'export type T = {};' },
        { path: 'src/App.tsx', content: 'export default function App() {}' },
      ],
      warnings: [],
    });

    const result = await pipeline.runGeneration('test execution');

    expect(mocks.executePhase).toHaveBeenCalledTimes(1);
    expect(result.generatedFiles).toHaveLength(2);
    expect(result.generatedFiles.map(f => f.path)).toEqual(['src/types.ts', 'src/App.tsx']);
  });

  it('emits oneshot phase-start and phase-complete events for simple plans', async () => {
    mockIntentProvider.generate.mockResolvedValue({ success: true, content: validIntentJson });
    mockPlanningProvider.generate.mockResolvedValue({ success: true, content: validPlanJson }); // 1 file → one-shot

    const stageStarts: string[] = [];
    const stageCompletes: string[] = [];

    await pipeline.runGeneration('test events', {
      onStageStart: (stage) => stageStarts.push(stage),
      onStageComplete: (stage) => stageCompletes.push(stage),
    });

    expect(stageStarts).toContain('oneshot');
    expect(stageCompletes).toContain('oneshot');
  });
});
