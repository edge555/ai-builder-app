/**
 * Tests for PipelineOrchestrator
 *
 * Covers:
 * - Graceful degradation: intent/planning/review failures → null output, pipeline continues
 * - Hard-fail: execution failure → rejects, downstream stages not called
 * - mergeReviewCorrections: pass verdict, fixed verdict (overlay by path, new files added)
 * - Stage callbacks: onStageStart / onStageComplete / onStageFailed fired correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipelineOrchestrator } from '../pipeline-orchestrator';
import type { PipelineCallbacks, GeneratedFile } from '../pipeline-orchestrator';
import type { AIProvider, AIResponse } from '../../ai/ai-provider';
import type { IPromptProvider } from '../prompts/prompt-provider';

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

const DEFAULT_FILES: GeneratedFile[] = [
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

const intentOk   = (): AIResponse => ok(INTENT_JSON);
const planOk     = (): AIResponse => ok(PLAN_JSON);
const reviewPass = (): AIResponse => ok({ verdict: 'pass', corrections: [] });
const reviewFixed = (
  corrections: Array<{ path: string; content: string; reason: string }>
): AIResponse => ok({ verdict: 'fixed', corrections });

// ─── Test Setup ───────────────────────────────────────────────────────────────

let orchestrator: PipelineOrchestrator;
let mockIntent:    AIProvider;
let mockPlanning:  AIProvider;
let mockExecution: AIProvider;
let mockReview:    AIProvider;
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
    getReviewSystemPrompt:              vi.fn().mockReturnValue('review prompt'),
    getBugfixSystemPrompt:              vi.fn().mockReturnValue('bugfix prompt'),
    tokenBudgets: {
      intent:               512,
      planning:            4096,
      executionGeneration: 16384,
      executionModification: 16384,
      review:              32768,
      bugfix:               8192,
      architecturePlanning: 8192,
      planReview:           4096,
      scaffold:             6000,
      logic:               10000,
      ui:                  20000,
      integration:          8000,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mockIntent    = makeProvider();
  mockPlanning  = makeProvider();
  mockExecution = makeProvider();
  mockReview    = makeProvider();
  mockPrompts   = makePromptProvider();

  // Default happy-path responses for all stages
  vi.mocked(mockIntent.generate).mockResolvedValue(intentOk());
  vi.mocked(mockPlanning.generate).mockResolvedValue(planOk());
  vi.mocked(mockExecution.generateStreaming).mockResolvedValue(executionOk());
  vi.mocked(mockReview.generate).mockResolvedValue(reviewPass());

  orchestrator = new PipelineOrchestrator(
    mockIntent,
    mockPlanning,
    mockExecution,
    mockReview,
    mockPrompts,
  );
});

// ─── Stage: Intent (graceful degradation) ─────────────────────────────────────

describe('intent stage graceful degradation', () => {
  it('sets intentOutput to null when provider returns failure', async () => {
    vi.mocked(mockIntent.generate).mockResolvedValue(fail('Network timeout'));

    const result = await orchestrator.runModificationPipeline('build a counter', {}, [], {});

    expect(result.intentOutput).toBeNull();
  });

  it('sets intentOutput to null when provider throws', async () => {
    vi.mocked(mockIntent.generate).mockRejectedValue(new Error('Connection refused'));

    const result = await orchestrator.runModificationPipeline('build a counter', {}, [], {});

    expect(result.intentOutput).toBeNull();
  });

  it('sets intentOutput to null when provider returns invalid JSON', async () => {
    vi.mocked(mockIntent.generate).mockResolvedValue({ success: true, content: 'not-json' });

    const result = await orchestrator.runModificationPipeline('build a counter', {}, [], {});

    expect(result.intentOutput).toBeNull();
  });

  it('continues to planning stage after intent failure', async () => {
    vi.mocked(mockIntent.generate).mockResolvedValue(fail());

    await orchestrator.runModificationPipeline('build a counter', {}, [], {});

    expect(mockPlanning.generate).toHaveBeenCalled();
  });

  it('still produces executorFiles after intent failure', async () => {
    vi.mocked(mockIntent.generate).mockResolvedValue(fail());

    const result = await orchestrator.runModificationPipeline('build a counter', {}, [], {});

    expect(result.executorFiles).toEqual(DEFAULT_FILES);
  });

  it('fires onStageFailed for intent on failure', async () => {
    vi.mocked(mockIntent.generate).mockResolvedValue(fail('API error'));
    const onStageFailed = vi.fn();

    await orchestrator.runModificationPipeline('build a counter', {}, [], { onStageFailed });

    expect(onStageFailed).toHaveBeenCalledWith('intent', expect.any(String));
  });

  it('does not fire onStageComplete for intent on failure', async () => {
    vi.mocked(mockIntent.generate).mockResolvedValue(fail());
    const onStageComplete = vi.fn();

    await orchestrator.runModificationPipeline('build a counter', {}, [], { onStageComplete });

    expect(onStageComplete).not.toHaveBeenCalledWith('intent');
  });
});

// ─── Stage: Planning (graceful degradation) ───────────────────────────────────

describe('planning stage graceful degradation', () => {
  it('sets planOutput to null when provider returns failure', async () => {
    vi.mocked(mockPlanning.generate).mockResolvedValue(fail());

    const result = await orchestrator.runModificationPipeline('build a counter', {}, [], {});

    expect(result.planOutput).toBeNull();
  });

  it('sets planOutput to null when provider throws', async () => {
    vi.mocked(mockPlanning.generate).mockRejectedValue(new Error('Timeout'));

    const result = await orchestrator.runModificationPipeline('build a counter', {}, [], {});

    expect(result.planOutput).toBeNull();
  });

  it('continues to execution stage after planning failure', async () => {
    vi.mocked(mockPlanning.generate).mockRejectedValue(new Error('Timeout'));

    await orchestrator.runModificationPipeline('build a counter', {}, [], {});

    expect(mockExecution.generateStreaming).toHaveBeenCalled();
  });

  it('still produces executorFiles after planning failure', async () => {
    vi.mocked(mockPlanning.generate).mockResolvedValue(fail());

    const result = await orchestrator.runModificationPipeline('build a counter', {}, [], {});

    expect(result.executorFiles).toEqual(DEFAULT_FILES);
  });

  it('fires onStageFailed for planning on failure', async () => {
    vi.mocked(mockPlanning.generate).mockResolvedValue(fail('Rate limited'));
    const onStageFailed = vi.fn();

    await orchestrator.runModificationPipeline('build a counter', {}, [], { onStageFailed });

    expect(onStageFailed).toHaveBeenCalledWith('planning', expect.any(String));
  });
});

// ─── Stage: Execution (hard-fail) ─────────────────────────────────────────────

describe('execution stage hard-fail', () => {
  it('rejects when execution provider returns failure', async () => {
    vi.mocked(mockExecution.generateStreaming).mockResolvedValue(fail('Out of memory'));

    await expect(
      orchestrator.runModificationPipeline('build a counter', {}, [], {})
    ).rejects.toThrow();
  });

  it('rejects when execution provider throws', async () => {
    vi.mocked(mockExecution.generateStreaming).mockRejectedValue(new Error('Fatal error'));

    await expect(
      orchestrator.runModificationPipeline('build a counter', {}, [], {})
    ).rejects.toThrow();
  });

  it('does not call review stage when execution fails', async () => {
    vi.mocked(mockExecution.generateStreaming).mockResolvedValue(fail());

    await expect(
      orchestrator.runModificationPipeline('build a counter', {}, [], {})
    ).rejects.toThrow();

    expect(mockReview.generate).not.toHaveBeenCalled();
  });
});

// ─── Stage: Review (graceful degradation) ─────────────────────────────────────

describe('review stage graceful degradation', () => {
  it('sets reviewOutput to null when provider returns failure', async () => {
    vi.mocked(mockReview.generate).mockResolvedValue(fail());

    const result = await orchestrator.runModificationPipeline('build a counter', {}, [], {});

    expect(result.reviewOutput).toBeNull();
  });

  it('sets reviewOutput to null when provider throws', async () => {
    vi.mocked(mockReview.generate).mockRejectedValue(new Error('Context window exceeded'));

    const result = await orchestrator.runModificationPipeline('build a counter', {}, [], {});

    expect(result.reviewOutput).toBeNull();
  });

  it('finalFiles equals executorFiles when review returns failure', async () => {
    vi.mocked(mockReview.generate).mockResolvedValue(fail());

    const result = await orchestrator.runModificationPipeline('build a counter', {}, [], {});

    expect(result.finalFiles).toEqual(result.executorFiles);
  });

  it('finalFiles equals executorFiles when review throws', async () => {
    vi.mocked(mockReview.generate).mockRejectedValue(new Error('Review failed'));

    const result = await orchestrator.runModificationPipeline('build a counter', {}, [], {});

    expect(result.finalFiles).toEqual(result.executorFiles);
  });

  it('fires onStageFailed for review on failure', async () => {
    vi.mocked(mockReview.generate).mockResolvedValue(fail('Upstream error'));
    const onStageFailed = vi.fn();

    await orchestrator.runModificationPipeline('build a counter', {}, [], { onStageFailed });

    expect(onStageFailed).toHaveBeenCalledWith('review', expect.any(String));
  });
});

// ─── Happy-path pipeline result ───────────────────────────────────────────────

describe('successful modification pipeline', () => {
  it('returns correct intentOutput on success', async () => {
    const result = await orchestrator.runModificationPipeline('build a counter', {}, [], {});

    expect(result.intentOutput).not.toBeNull();
    expect(result.intentOutput?.complexity).toBe('simple');
  });

  it('returns correct planOutput on success', async () => {
    const result = await orchestrator.runModificationPipeline('build a counter', {}, [], {});

    expect(result.planOutput).not.toBeNull();
    expect(result.planOutput?.files).toHaveLength(1);
  });

  it('fires onStageStart for all 4 stages in order', async () => {
    const stagesStarted: string[] = [];
    const callbacks: PipelineCallbacks = {
      onStageStart: (stage) => { stagesStarted.push(stage); },
    };

    await orchestrator.runModificationPipeline('build a counter', {}, [], callbacks);

    expect(stagesStarted).toEqual(['intent', 'planning', 'execution', 'review']);
  });

  it('fires onStageComplete for all 4 stages in order', async () => {
    const stagesCompleted: string[] = [];
    const callbacks: PipelineCallbacks = {
      onStageComplete: (stage) => { stagesCompleted.push(stage); },
    };

    await orchestrator.runModificationPipeline('build a counter', {}, [], callbacks);

    expect(stagesCompleted).toEqual(['intent', 'planning', 'execution', 'review']);
  });

  it('returns reviewPass with finalFiles equal to executorFiles', async () => {
    const result = await orchestrator.runModificationPipeline('build a counter', {}, [], {});

    expect(result.reviewOutput?.verdict).toBe('pass');
    expect(result.finalFiles).toEqual(result.executorFiles);
  });
});

// ─── mergeReviewCorrections ───────────────────────────────────────────────────

describe('mergeReviewCorrections', () => {
  const baseFiles: GeneratedFile[] = [
    { path: 'src/App.tsx',   content: 'original-app' },
    { path: 'src/index.css', content: 'original-css' },
  ];

  it('returns executorFiles unchanged when reviewOutput is null', () => {
    const result = orchestrator.mergeReviewCorrections(baseFiles, null);

    expect(result).toEqual(baseFiles);
  });

  it('returns executorFiles unchanged when verdict is pass', () => {
    const review = { verdict: 'pass' as const, corrections: [] };

    const result = orchestrator.mergeReviewCorrections(baseFiles, review);

    expect(result).toEqual(baseFiles);
  });

  it('returns executorFiles unchanged when corrections array is empty', () => {
    const review = { verdict: 'fixed' as const, corrections: [] };

    const result = orchestrator.mergeReviewCorrections(baseFiles, review);

    expect(result).toEqual(baseFiles);
  });

  it('overlays corrections by path when verdict is fixed', () => {
    const review = {
      verdict: 'fixed' as const,
      corrections: [
        { path: 'src/App.tsx', content: 'corrected-app', reason: 'fixed missing key prop' },
      ],
    };

    const result = orchestrator.mergeReviewCorrections(baseFiles, review);

    expect(result).toHaveLength(2);
    expect(result.find(f => f.path === 'src/App.tsx')!.content).toBe('corrected-app');
    expect(result.find(f => f.path === 'src/index.css')!.content).toBe('original-css');
  });

  it('leaves uncorrected files unchanged', () => {
    const review = {
      verdict: 'fixed' as const,
      corrections: [
        { path: 'src/App.tsx', content: 'corrected-app', reason: 'fixed bug' },
      ],
    };

    const result = orchestrator.mergeReviewCorrections(baseFiles, review);

    expect(result.find(f => f.path === 'src/index.css')!.content).toBe('original-css');
  });

  it('adds new files introduced by review corrections', () => {
    const review = {
      verdict: 'fixed' as const,
      corrections: [
        { path: 'src/utils.ts', content: 'export const foo = 1;', reason: 'added missing util' },
      ],
    };

    const result = orchestrator.mergeReviewCorrections(baseFiles, review);

    expect(result).toHaveLength(3);
    expect(result.find(f => f.path === 'src/utils.ts')!.content).toBe('export const foo = 1;');
  });

  it('can replace multiple files in a single review pass', () => {
    const review = {
      verdict: 'fixed' as const,
      corrections: [
        { path: 'src/App.tsx',   content: 'corrected-app', reason: 'fixed App' },
        { path: 'src/index.css', content: 'corrected-css', reason: 'fixed CSS' },
      ],
    };

    const result = orchestrator.mergeReviewCorrections(baseFiles, review);

    expect(result.find(f => f.path === 'src/App.tsx')!.content).toBe('corrected-app');
    expect(result.find(f => f.path === 'src/index.css')!.content).toBe('corrected-css');
  });

  it('integration: review corrections are applied via runModificationPipeline', async () => {
    vi.mocked(mockReview.generate).mockResolvedValue(
      reviewFixed([
        { path: 'src/App.tsx', content: 'review-corrected', reason: 'fixed import error' },
      ])
    );

    const result = await orchestrator.runModificationPipeline('build a counter', {}, [], {});

    expect(result.reviewOutput?.verdict).toBe('fixed');
    expect(result.finalFiles.find(f => f.path === 'src/App.tsx')!.content).toBe('review-corrected');
    // Non-corrected files remain as-is
    expect(result.finalFiles.find(f => f.path === 'src/index.css')!.content).toBe(
      DEFAULT_FILES.find(f => f.path === 'src/index.css')!.content
    );
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
      orchestrator.runModificationPipeline('build a counter', {}, [], { signal: controller.signal })
    ).rejects.toThrow(/cancelled/i);
  });
});
