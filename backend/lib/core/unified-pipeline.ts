/**
 * @module core/unified-pipeline
 * @description UnifiedPipeline<TContext, TResult> — a single generic pipeline class
 * that replaces both GenerationPipeline and PipelineOrchestrator via the Strategy pattern.
 *
 * The pipeline is responsible for:
 * 1. Running the shared intent stage (runIntentStage from pipeline-shared.ts)
 * 2. Calling strategy.runPlanning() unless canSkipPlanning() is true
 * 3. Calling strategy.runExecution() with the resulting context
 *
 * All pipeline-specific logic (recipe selection, phase execution, modification prompt
 * building, etc.) lives in the concrete strategy implementations.
 */

import type { AIProvider } from '../ai/ai-provider';
import type { IPromptProvider } from './prompts/prompt-provider';
import { createLogger } from '../logger';
import { runIntentStage, type UnifiedPipelineCallbacks } from './pipeline-shared';
import type { IPipelineStrategy } from './pipeline-strategy';

const logger = createLogger('UnifiedPipeline');

export interface UnifiedPipelineOptions {
  requestId?: string;
  skipIntent?: boolean;
  skipPlanning?: boolean;
  /** Any additional options forwarded to the strategy. */
  [key: string]: unknown;
}

/**
 * Generic pipeline host class.
 *
 * TContext — the context produced by runPlanning (e.g. ArchitecturePlan, PlanOutput).
 * TResult  — the final result produced by runExecution (e.g. GenerationResult, PipelineResult).
 */
export class UnifiedPipeline<TContext, TResult> {
  /** Exposed for callers that need to access strategy-specific fields (e.g. bugfixProvider). */
  readonly strategy: IPipelineStrategy<TContext, TResult>;

  constructor(
    private readonly intentProvider: AIProvider,
    private readonly promptProvider: IPromptProvider,
    strategy: IPipelineStrategy<TContext, TResult>,
  ) {
    this.strategy = strategy;
  }

  /**
   * Runs the full pipeline: intent → planning → execution.
   *
   * @param userPrompt - The user's prompt
   * @param callbacks  - Lifecycle callbacks (stage start/complete, streaming, abort)
   * @param options    - Optional request metadata and skip flags
   */
  async run(
    userPrompt: string,
    callbacks: UnifiedPipelineCallbacks = {},
    options?: UnifiedPipelineOptions,
  ): Promise<TResult> {
    const contextLogger = options?.requestId ? logger.withRequestId(options.requestId) : logger;

    // ── Stage 1: Intent ──────────────────────────────────────────────────────
    const intentOutput = options?.skipIntent
      ? null
      : await runIntentStage(userPrompt, this.intentProvider, this.promptProvider, callbacks, contextLogger);

    if (callbacks.signal?.aborted) throw new Error('Pipeline cancelled by client');

    // ── Stage 2: Planning ────────────────────────────────────────────────────
    let planContext: TContext | null = null;
    const skipPlanning = options?.skipPlanning ?? this.strategy.canSkipPlanning();

    if (!skipPlanning) {
      planContext = await this.strategy.runPlanning(userPrompt, intentOutput, callbacks, options as Record<string, unknown>);
    }

    if (callbacks.signal?.aborted) throw new Error('Pipeline cancelled by client');

    // ── Stage 3: Execution ───────────────────────────────────────────────────
    return this.strategy.runExecution(userPrompt, intentOutput, planContext, callbacks, options as Record<string, unknown>);
  }

  // ─── Legacy compatibility aliases ─────────────────────────────────────────

  /**
   * Alias for GenerationPipeline.runGeneration() used by streaming-generator.ts.
   * Delegates to run() with the same signature.
   */
  async runGeneration(
    userPrompt: string,
    callbacks: UnifiedPipelineCallbacks = {},
    options?: UnifiedPipelineOptions,
  ): Promise<TResult> {
    return this.run(userPrompt, callbacks, options);
  }

  /**
   * Alias for PipelineOrchestrator.runModificationPipeline() used by modification-engine.ts.
   */
  async runModificationPipeline(
    userPrompt: string,
    _currentFiles: Record<string, string>,
    _fileSlices: unknown[],
    callbacks: UnifiedPipelineCallbacks,
    options?: UnifiedPipelineOptions,
  ): Promise<TResult> {
    return this.run(userPrompt, callbacks, options);
  }

  /**
   * Alias for PipelineOrchestrator.runOrderedModificationPipeline() used by modification-engine.ts.
   * The tiers and validateFile are baked into the ModificationStrategy at construction time.
   */
  async runOrderedModificationPipeline(
    userPrompt: string,
    _currentFiles: Record<string, string>,
    _tiers: string[][],
    _validateFile: (path: string, content: string) => Promise<{ valid: boolean; errorText?: string }>,
    callbacks: UnifiedPipelineCallbacks,
    options?: UnifiedPipelineOptions,
  ): Promise<TResult> {
    return this.run(userPrompt, callbacks, options);
  }
}
