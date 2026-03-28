import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PhaseExecutor, PhaseDefinition } from '../phase-executor';
import { AIProvider, AIStreamingRequest, AIResponse } from '../../ai/ai-provider';
import { IPromptProvider, ArchitecturePlan } from '../prompts/prompt-provider';
import { BuildValidator } from '../build-validator';
import { PhaseContext } from '../batch-context-builder';
import { GeneratedFile } from '../schemas';

describe('PhaseExecutor', () => {
  let mockProvider: import('vitest').Mocked<AIProvider>;
  let mockPromptProvider: import('vitest').Mocked<IPromptProvider>;
  let mockValidator: import('vitest').Mocked<BuildValidator>;
  
  let executor: PhaseExecutor;
  
  const basePlan: ArchitecturePlan = {
    files: [
      { path: 'src/types.ts', purpose: 'types', layer: 'scaffold', exports: ['User'], imports: [] },
      { path: 'src/main.ts', purpose: 'main', layer: 'scaffold', exports: [], imports: [] },
      { path: 'src/ui/Button.tsx', purpose: 'btn', layer: 'ui', exports: ['Button'], imports: [] }
    ],
    components: [],
    dependencies: [],
    routing: [],
    typeContracts: [],
    cssVariables: [],
    stateShape: { contexts: [], hooks: [] }
  };

  const basePhaseDef: PhaseDefinition = {
    layer: 'scaffold',
    plan: basePlan,
    userPrompt: 'test prompt'
  };

  const baseContext: PhaseContext = {
    typeDefinitions: new Map(),
    directDependencies: new Map(),
    fileSummaries: [],
    cssVariables: [],
    relevantContracts: { typeContracts: [], stateShape: { contexts: [], hooks: [] } },
    missingPlannedImports: [],
  };

  beforeEach(() => {
    mockProvider = {
      generate: vi.fn(),
      generateStreaming: vi.fn()
    };

    mockPromptProvider = {
      getIntentSystemPrompt: vi.fn(),
      getPlanningSystemPrompt: vi.fn(),
      getArchitecturePlanningPrompt: vi.fn(),
      getPlanReviewPrompt: vi.fn(),
      getExecutionGenerationSystemPrompt: vi.fn(),
      getExecutionModificationSystemPrompt: vi.fn(),
      getReviewSystemPrompt: vi.fn(),
      getBugfixSystemPrompt: vi.fn(),
      getPhasePrompt: vi.fn().mockReturnValue('mocked system prompt'),
      tokenBudgets: {
        intent: 100, planning: 100, executionGeneration: 100,
        executionModification: 100, review: 100, bugfix: 100,
        architecturePlanning: 100, planReview: 100,
        scaffold: 2000, logic: 2000, ui: 2000, integration: 2000, oneshot: 2000
      }
    };

    mockValidator = {
      validate: vi.fn().mockReturnValue({ valid: true, errors: [] }),
      formatErrorsForAI: vi.fn().mockImplementation((errors) => JSON.stringify(errors)),
      validateServerClientBoundaries: vi.fn(),
      validatePrismaSchema: vi.fn(),
      validateAppRouterConventions: vi.fn(),
      validateAll: vi.fn()
    };

    executor = new PhaseExecutor(mockProvider, mockPromptProvider, mockValidator);
  });

  it('executes a phase and streams files successfully', async () => {
    // Mock the streaming to emit chunks that form 2 complete files
    mockProvider.generateStreaming.mockImplementation(async (req: AIStreamingRequest) => {
      const chunk1 = '{ "path": "src/types.ts", "content": "export type User = {}" }';
      const chunk2 = ' \n { "path": "src/main.ts", "content": "console.log(1)" }';
      req.onChunk?.(chunk1, chunk1.length);
      req.onChunk?.(chunk2, chunk1.length + chunk2.length);
      return { success: true };
    });

    const onFileStream = vi.fn();
    const result = await executor.executePhase(basePhaseDef, baseContext, { onFileStream });

    expect(result.files).toHaveLength(2);
    expect(result.files[0].path).toBe('src/types.ts');
    expect(result.files[1].path).toBe('src/main.ts');
    
    // Check callbacks triggered
    expect(onFileStream).toHaveBeenCalledWith(expect.objectContaining({ path: 'src/types.ts' }), false);
    expect(onFileStream).toHaveBeenCalledWith(expect.objectContaining({ path: 'src/main.ts' }), false);
    
    // Complete markers sent at the end
    expect(onFileStream).toHaveBeenCalledWith(expect.objectContaining({ path: 'src/types.ts' }), true);
  });

  it('retries on syntax error and succeeds', async () => {
    let callCount = 0;
    mockProvider.generateStreaming.mockImplementation(async (req: AIStreamingRequest) => {
      callCount++;
      if (callCount === 1) {
        const chunk = '{ "path": "src/types.ts", "content": "bad syntax" } \n { "path": "src/main.ts", "content": "ok" }';
        req.onChunk?.(chunk, chunk.length);
      } else {
        const chunk = '{ "path": "src/types.ts", "content": "fixed" } \n { "path": "src/main.ts", "content": "ok" }';
        req.onChunk?.(chunk, chunk.length);
      }
      return { success: true };
    });

    // Mock validation to fail on first call, pass on second
    mockValidator.validate.mockImplementationOnce(() => ({
      valid: false,
      errors: [{ type: 'syntax_error', message: 'syntax err', file: 'src/types.ts', severity: 'fixable' }]
    })).mockImplementationOnce(() => ({
      valid: true,
      errors: []
    }));

    const result = await executor.executePhase(basePhaseDef, baseContext);

    expect(callCount).toBe(2);
    expect(result.files[0].content).toBe('fixed');
    
    // Check that the second prompt included the error feedback
    const secondCallPrompt = mockProvider.generateStreaming.mock.calls[1][0].systemInstruction;
    expect(secondCallPrompt).toContain('PREVIOUS ATTEMPT FAILED');
  });

  it('hard fails (throws) for scaffold layer if max retries exceeded', async () => {
    mockProvider.generateStreaming.mockRejectedValue(new Error('Network fail'));

    await expect(executor.executePhase(basePhaseDef, baseContext))
      .rejects.toThrow('Scaffold phase critical failure');
  });

  it('soft fails (returns partial results) for non-scaffold layers if max retries exceeded', async () => {
    const uiPhaseDef: PhaseDefinition = { ...basePhaseDef, layer: 'ui' };
    
    // Provide 1 file out of 1 expected, but then network crashes or throws error
    mockProvider.generateStreaming.mockImplementation(async (req: AIStreamingRequest) => {
      const chunk = '{ "path": "src/ui/Button.tsx", "content": "export const Button = () => <div/>;" }';
      req.onChunk?.(chunk, chunk.length);
      throw new Error('LLM Crash');
    });

    const result = await executor.executePhase(uiPhaseDef, baseContext);
    
    // Should salvage the parsed file
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('src/ui/Button.tsx');
    expect(result.warnings[0]).toContain('LLM Crash');
  });

  // ── Phase 5: expectedFiles override + oneshot continuation ────────────────

  it('uses expectedFiles override for allExpectedFiles when set in PhaseDefinition', async () => {
    // Files in the plan have layer 'scaffold', but phaseDef.layer is 'oneshot' (no layer match)
    // Without expectedFiles, allExpectedFiles would be empty and truncation detection disabled.
    const oneshotDef: PhaseDefinition = {
      layer: 'oneshot',
      plan: basePlan,
      userPrompt: 'test',
      expectedFiles: ['src/types.ts', 'src/main.ts', 'src/ui/Button.tsx'],
    };

    let callCount = 0;
    mockProvider.generateStreaming.mockImplementation(async (req: AIStreamingRequest) => {
      callCount++;
      if (callCount === 1) {
        // Only emit one file — truncation should be detected for the other two
        const chunk = '{ "path": "src/types.ts", "content": "export type T = {}" }';
        req.onChunk?.(chunk, chunk.length);
      } else {
        // Continuation: emit the remaining files
        const chunk = '{ "path": "src/main.ts", "content": "main" } { "path": "src/ui/Button.tsx", "content": "btn" }';
        req.onChunk?.(chunk, chunk.length);
      }
      return { success: true };
    });

    const result = await executor.executePhase(oneshotDef, baseContext);

    expect(callCount).toBe(2); // truncation detected → continuation fired
    expect(result.files).toHaveLength(3);
  });

  it('oneshot continuation prompt includes already-generated file paths', async () => {
    const oneshotDef: PhaseDefinition = {
      layer: 'oneshot',
      plan: basePlan,
      userPrompt: 'test',
      expectedFiles: ['src/types.ts', 'src/main.ts'],
    };

    let callCount = 0;
    mockProvider.generateStreaming.mockImplementation(async (req: AIStreamingRequest) => {
      callCount++;
      if (callCount === 1) {
        const chunk = '{ "path": "src/types.ts", "content": "export type T = {}" }';
        req.onChunk?.(chunk, chunk.length);
      } else {
        const chunk = '{ "path": "src/main.ts", "content": "main" }';
        req.onChunk?.(chunk, chunk.length);
      }
      return { success: true };
    });

    await executor.executePhase(oneshotDef, baseContext);

    // Continuation prompt (second call) should list already-generated files
    const continuationCall = mockProvider.generateStreaming.mock.calls[1][0];
    expect(continuationCall.prompt).toContain('src/types.ts'); // already generated
    expect(continuationCall.prompt).toContain('src/main.ts');  // missing file
    expect(continuationCall.prompt).toContain('already generated');
  });

  it('detects truncation and requests missing files via continuation', async () => {
    let callCount = 0;
    mockProvider.generateStreaming.mockImplementation(async (req: AIStreamingRequest) => {
      callCount++;
      if (callCount === 1) {
        // Only emit types.ts, truncate before main.ts
        const chunk = '{ "path": "src/types.ts", "content": "export type User = {}" }';
        req.onChunk?.(chunk, chunk.length);
      } else if (callCount === 2) {
        // Continuation emits remaining files
        const chunk = '{ "path": "src/main.ts", "content": "console.log(1)" }';
        req.onChunk?.(chunk, chunk.length);
      }
      return { success: true };
    });

    const result = await executor.executePhase(basePhaseDef, baseContext);

    // Assert there were 2 LLM calls due to truncation continuation
    expect(callCount).toBe(2);
    expect(result.files).toHaveLength(2); // Gathered successfully
    
    // The second call prompt should be the continuation prompt
    const secondCall = mockProvider.generateStreaming.mock.calls[1][0];
    expect(secondCall.prompt).toContain('missing files');
    expect(secondCall.prompt).toContain('src/main.ts');
  });
});
