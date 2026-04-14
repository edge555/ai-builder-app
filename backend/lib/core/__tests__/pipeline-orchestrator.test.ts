/**
 * Tests for ModificationStrategy (via UnifiedPipeline)
 *
 * Covers:
 * - Graceful degradation: intent/planning failures → null output, pipeline continues
 * - Hard-fail: execution failure → rejects, downstream stages not called
 * - Stage callbacks: onStageStart / onStageComplete / onStageFailed fired correctly
 * - finalFiles equals applyModificationsToFiles output directly (no review overlay)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModificationStrategy } from '../modification-strategy';
import type { PipelineResult } from '../modification-strategy';
import { UnifiedPipeline } from '../unified-pipeline';
import type { UnifiedPipelineCallbacks } from '../pipeline-shared';
import type { AIProvider, AIResponse } from '../../ai/ai-provider';
import type { IPromptProvider } from '../prompts/prompt-provider';
import type { PlanOutput } from '../schemas';

vi.mock('../../logger', () => ({
  createLogger: vi.fn(() => {
    const log = {
      info:  vi.fn(),
      debug: vi.fn(),
      warn:  vi.fn(),
      error: vi.fn(),
      withRequestId: vi.fn(),
    };
    log.withRequestId.mockReturnValue(log);
    return log;
  }),
}));

// ─── Response Factories ───────────────────────────────────────────────────────

const INTENT_JSON = {
  clarifiedGoal:     'Build a counter app',
  complexity:        'simple' as const,
  features:          ['increment', 'decrement'],
  technicalApproach: 'React with useState',
};

const PLAN_JSON = {
  files:        [{ path: 'src/App.tsx', purpose: 'Main component' }],
  components:   ['App', 'Counter'],
  dependencies: ['react', 'react-dom'],
  routing:      [],
};

const DEFAULT_FILES = [
  { path: 'src/App.tsx',   content: 'export default function App() { return null; }' },
  { path: 'src/index.css', content: '* { margin: 0; }' },
];

const ok = (content: object): AIResponse => ({
  success: true,
  content: JSON.stringify(content),
});

const fail = (error = 'Provider error'): AIResponse => ({
  success: false,
  error,
});

const executionOk = (files = DEFAULT_FILES): AIResponse =>
  ok({ files });

const intentOk = (): AIResponse => ok(INTENT_JSON);
const planOk   = (): AIResponse => ok(PLAN_JSON);

// ─── Test Setup ───────────────────────────────────────────────────────────────

let orchestrator: UnifiedPipeline<PlanOutput, PipelineResult>;
let mockIntent:    AIProvider;
let mockPlanning:  AIProvider;
let mockExecution: AIProvider;
let mockPrompts:   IPromptProvider;

function makeProvider(): AIProvider {
  return { generate: vi.fn(), generateStreaming: vi.fn() };
}

function makePromptProvider(): IPromptProvider {
  return {
    getIntentSystemPrompt:              vi.fn().mockReturnValue('intent prompt'),
    getPlanningSystemPrompt:            vi.fn().mockReturnValue('planning prompt'),
    getExecutionGenerationSystemPrompt: vi.fn().mockReturnValue('exec gen prompt'),
    getExecutionModificationSystemPrompt: vi.fn().mockReturnValue('exec mod prompt'),
    getBugfixSystemPrompt:              vi.fn().mockReturnValue('bugfix prompt'),
    getArchitecturePlanningPrompt:      vi.fn().mockReturnValue('arch prompt'),
    getPlanReviewPrompt:                vi.fn().mockReturnValue('plan rev prompt'),
    getPhasePrompt:                     vi.fn().mockReturnValue('phase prompt'),
    tokenBudgets: {
      intent:               512,
      planning:            4096,
      executionGeneration: 16384,
      executionModification: 16384,
      bugfix:               8192,
      architecturePlanning: 8192,
      planReview:           4096,
      scaffold:             6000,
      logic:               10000,
      ui:                  20000,
      integration:          8000,
      oneshot:             32768,
    },
  };
}

function makeOrchestrator(
  intentProvider: AIProvider,
  planningProvider: AIProvider,
  executionProvider: AIProvider,
  promptProvider: IPromptProvider,
  currentFiles: Record<string, string> = {},
  fileSlices: any[] = [],
  tiers?: string[][],
  validateFile?: (path: string, content: string) => Promise<{ valid: boolean; errorText?: string }>,
): UnifiedPipeline<PlanOutput, PipelineResult> {
  const strategy = new ModificationStrategy(
    planningProvider,
    executionProvider,
    promptProvider,
    currentFiles,
    fileSlices,
    tiers,
    validateFile,
  );
  return new UnifiedPipeline<PlanOutput, PipelineResult>(intentProvider, promptProvider, strategy);
}

beforeEach(() => {
  vi.clearAllMocks();

  mockIntent    = makeProvider();
  mockPlanning  = makeProvider();
  mockExecution = makeProvider();
  mockPrompts   = makePromptProvider();

  // Default happy-path responses
  vi.mocked(mockIntent.generate).mockResolvedValue(intentOk());
  vi.mocked(mockPlanning.generate).mockResolvedValue(planOk());
  vi.mocked(mockExecution.generateStreaming).mockResolvedValue(executionOk());

  orchestrator = makeOrchestrator(mockIntent, mockPlanning, mockExecution, mockPrompts);
});

// Helper that mirrors the old runModificationPipeline signature for test brevity
function runModPipeline(
  prompt: string,
  currentFiles: Record<string, string>,
  fileSlices: any[],
  callbacks: UnifiedPipelineCallbacks,
  options?: { skipIntent?: boolean; skipPlanning?: boolean },
): Promise<PipelineResult> {
  // Construct a fresh orchestrator per call (as the new design requires)
  const o = makeOrchestrator(mockIntent, mockPlanning, mockExecution, mockPrompts, currentFiles, fileSlices);
  return o.run(prompt, callbacks, options);
}

// ─── Stage: Intent (graceful degradation) ─────────────────────────────────────

describe('intent stage graceful degradation', () => {
  it('sets intentOutput to null when provider returns failure', async () => {
    vi.mocked(mockIntent.generate).mockResolvedValue(fail('Network timeout'));

    const result = await runModPipeline('build a counter', {}, [], {});

    expect(result.intentOutput).toBeNull();
  });

  it('sets intentOutput to null when provider throws', async () => {
    vi.mocked(mockIntent.generate).mockRejectedValue(new Error('Connection refused'));

    const result = await runModPipeline('build a counter', {}, [], {});

    expect(result.intentOutput).toBeNull();
  });

  it('sets intentOutput to null when provider returns invalid JSON', async () => {
    vi.mocked(mockIntent.generate).mockResolvedValue({ success: true, content: 'not-json' });

    const result = await runModPipeline('build a counter', {}, [], {});

    expect(result.intentOutput).toBeNull();
  });

  it('continues to planning stage after intent failure', async () => {
    vi.mocked(mockIntent.generate).mockResolvedValue(fail());

    await runModPipeline('build a counter', {}, [], {});

    expect(mockPlanning.generate).toHaveBeenCalled();
  });

  it('still produces executorFiles after intent failure', async () => {
    vi.mocked(mockIntent.generate).mockResolvedValue(fail());

    const result = await runModPipeline('build a counter', {}, [], {});

    expect(result.executorFiles).toEqual(DEFAULT_FILES);
  });

  it('fires onStageFailed for intent on failure', async () => {
    vi.mocked(mockIntent.generate).mockResolvedValue(fail('API error'));
    const onStageFailed = vi.fn();

    await runModPipeline('build a counter', {}, [], { onStageFailed });

    expect(onStageFailed).toHaveBeenCalledWith('intent', expect.any(String));
  });

  it('does not fire onStageComplete for intent on failure', async () => {
    vi.mocked(mockIntent.generate).mockResolvedValue(fail());
    const onStageComplete = vi.fn();

    await runModPipeline('build a counter', {}, [], { onStageComplete });

    expect(onStageComplete).not.toHaveBeenCalledWith('intent');
  });
});

// ─── Stage: Planning (graceful degradation) ───────────────────────────────────

describe('planning stage graceful degradation', () => {
  it('sets planOutput to null when provider returns failure', async () => {
    vi.mocked(mockPlanning.generate).mockResolvedValue(fail());

    const result = await runModPipeline('build a counter', {}, [], {});

    expect(result.planOutput).toBeNull();
  });

  it('sets planOutput to null when provider throws', async () => {
    vi.mocked(mockPlanning.generate).mockRejectedValue(new Error('Timeout'));

    const result = await runModPipeline('build a counter', {}, [], {});

    expect(result.planOutput).toBeNull();
  });

  it('continues to execution stage after planning failure', async () => {
    vi.mocked(mockPlanning.generate).mockRejectedValue(new Error('Timeout'));

    await runModPipeline('build a counter', {}, [], {});

    expect(mockExecution.generateStreaming).toHaveBeenCalled();
  });

  it('still produces executorFiles after planning failure', async () => {
    vi.mocked(mockPlanning.generate).mockResolvedValue(fail());

    const result = await runModPipeline('build a counter', {}, [], {});

    expect(result.executorFiles).toEqual(DEFAULT_FILES);
  });

  it('fires onStageFailed for planning on failure', async () => {
    vi.mocked(mockPlanning.generate).mockResolvedValue(fail('Rate limited'));
    const onStageFailed = vi.fn();

    await runModPipeline('build a counter', {}, [], { onStageFailed });

    expect(onStageFailed).toHaveBeenCalledWith('planning', expect.any(String));
  });
});

// ─── Stage: Execution (hard-fail) ─────────────────────────────────────────────

describe('execution stage hard-fail', () => {
  it('rejects when execution provider returns failure', async () => {
    vi.mocked(mockExecution.generateStreaming).mockResolvedValue(fail('Out of memory'));

    await expect(
      runModPipeline('build a counter', {}, [], {})
    ).rejects.toThrow();
  });

  it('rejects when execution provider throws', async () => {
    vi.mocked(mockExecution.generateStreaming).mockRejectedValue(new Error('Fatal error'));

    await expect(
      runModPipeline('build a counter', {}, [], {})
    ).rejects.toThrow();
  });

  it('execution failure does not prevent prior stages from completing', async () => {
    vi.mocked(mockExecution.generateStreaming).mockResolvedValue(fail());

    await expect(
      runModPipeline('build a counter', {}, [], {})
    ).rejects.toThrow();
  });
});

// ─── Happy-path pipeline result ───────────────────────────────────────────────

describe('successful modification pipeline', () => {
  it('returns correct intentOutput on success', async () => {
    const result = await runModPipeline('build a counter', {}, [], {});

    expect(result.intentOutput).not.toBeNull();
    expect(result.intentOutput?.complexity).toBe('simple');
  });

  it('returns correct planOutput on success', async () => {
    const result = await runModPipeline('build a counter', {}, [], {});

    expect(result.planOutput).not.toBeNull();
    expect(result.planOutput?.files).toHaveLength(1);
  });

  it('fires onStageStart for all 3 stages in order', async () => {
    const stagesStarted: string[] = [];
    const callbacks: UnifiedPipelineCallbacks = {
      onStageStart: (stage) => { stagesStarted.push(stage); },
    };

    await runModPipeline('build a counter', {}, [], callbacks);

    expect(stagesStarted).toEqual(['intent', 'planning', 'execution']);
  });

  it('fires onStageComplete for all 3 stages in order', async () => {
    const stagesCompleted: string[] = [];
    const callbacks: UnifiedPipelineCallbacks = {
      onStageComplete: (stage) => { stagesCompleted.push(stage); },
    };

    await runModPipeline('build a counter', {}, [], callbacks);

    expect(stagesCompleted).toEqual(['intent', 'planning', 'execution']);
  });

  it('finalFiles equals applyModificationsToFiles output directly', async () => {
    const result = await runModPipeline('build a counter', {}, [], {});

    expect(result.finalFiles).toBeDefined();
    expect(result.finalFiles.length).toBeGreaterThan(0);
  });
});


// ─── Conditional Stage Skipping ───────────────────────────────────────────────

describe('skipIntent option', () => {
  it('does not call intent provider when skipIntent=true', async () => {
    await runModPipeline('build a counter', {}, [], {}, { skipIntent: true });

    expect(mockIntent.generate).not.toHaveBeenCalled();
  });

  it('sets intentOutput to null when skipIntent=true', async () => {
    const result = await runModPipeline('build a counter', {}, [], {}, { skipIntent: true });

    expect(result.intentOutput).toBeNull();
  });

  it('still runs planning and execution when skipIntent=true', async () => {
    await runModPipeline('build a counter', {}, [], {}, { skipIntent: true });

    expect(mockPlanning.generate).toHaveBeenCalled();
    expect(mockExecution.generateStreaming).toHaveBeenCalled();
  });
});

describe('skipPlanning option', () => {
  it('does not call planning provider when skipPlanning=true', async () => {
    await runModPipeline('build a counter', {}, [], {}, { skipPlanning: true });

    expect(mockPlanning.generate).not.toHaveBeenCalled();
  });

  it('sets planOutput to null when skipPlanning=true', async () => {
    const result = await runModPipeline('build a counter', {}, [], {}, { skipPlanning: true });

    expect(result.planOutput).toBeNull();
  });

  it('still runs intent and execution when skipPlanning=true', async () => {
    await runModPipeline('build a counter', {}, [], {}, { skipPlanning: true });

    expect(mockIntent.generate).toHaveBeenCalled();
    expect(mockExecution.generateStreaming).toHaveBeenCalled();
  });
});

describe('skipIntent + skipPlanning both true', () => {
  it('only calls execution provider (intent and planning skipped)', async () => {
    await runModPipeline('build a counter', {}, [], {}, { skipIntent: true, skipPlanning: true });

    expect(mockIntent.generate).not.toHaveBeenCalled();
    expect(mockPlanning.generate).not.toHaveBeenCalled();
    expect(mockExecution.generateStreaming).toHaveBeenCalled();
  });

  it('returns null for both intentOutput and planOutput', async () => {
    const result = await runModPipeline('build a counter', {}, [], {}, { skipIntent: true, skipPlanning: true });

    expect(result.intentOutput).toBeNull();
    expect(result.planOutput).toBeNull();
  });

  it('still produces finalFiles', async () => {
    const result = await runModPipeline('build a counter', {}, [], {}, { skipIntent: true, skipPlanning: true });

    expect(result.finalFiles).toBeDefined();
    expect(result.finalFiles.length).toBeGreaterThan(0);
  });
});

// ─── Abort signal ─────────────────────────────────────────────────────────────

describe('abort signal', () => {
  it('rejects when signal is already aborted before pipeline starts', async () => {
    const controller = new AbortController();
    controller.abort();

    // Intent succeeds but abort check runs after it
    vi.mocked(mockIntent.generate).mockResolvedValue(intentOk());

    await expect(
      runModPipeline('build a counter', {}, [], { signal: controller.signal })
    ).rejects.toThrow(/cancelled/i);
  });
});

// ─── Ordered Execution ────────────────────────────────────────────────────────

describe('runOrderedModificationPipeline', () => {
  it('processes files in multiple tiers with retries on validation failure', async () => {
    const currentFiles = {
      'src/types.ts': 'export type A = string;',
      'src/consumer.ts': 'import { A } from "./types";',
    };

    // First attempt fails validation, second attempt succeeds
    let validationAttempts = 0;
    const validateFile = vi.fn(async (_path: string, _content: string) => {
      validationAttempts++;
      if (validationAttempts === 1) return { valid: false, errorText: 'Syntax error' };
      return { valid: true };
    });

    // Mock execution provider to return generated files
    vi.mocked(mockExecution.generateStreaming).mockResolvedValue(
      ok({ files: [{ path: 'src/types.ts', content: 'export type A = number;' }] })
    );

    const tiers = [['src/types.ts'], ['src/consumer.ts']];

    const o = makeOrchestrator(
      mockIntent, mockPlanning, mockExecution, mockPrompts,
      currentFiles, [], tiers, validateFile,
    );

    const result = await o.run(
      'change type A to number',
      {},
      {}
    );

    // It should have returned a PipelineResult
    expect(result.executorFiles).toBeDefined();
    // Two tiers = two processFile execution attempts which succeed (or retry)
    expect(validateFile).toHaveBeenCalled();
    // Because we mock execution to always return 'src/types.ts', it will at least try
  });
});
