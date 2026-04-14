/**
 * @module core/pipeline-strategy
 * @description Strategy interface for the UnifiedPipeline.
 * Each concrete strategy encapsulates the planning + execution logic
 * for either generation (new project) or modification (existing project).
 */

import type { UnifiedPipelineCallbacks } from './pipeline-shared';

/**
 * Strategy interface for the UnifiedPipeline.
 *
 * TContext — the output of the planning stage (e.g. ArchitecturePlan, PlanOutput).
 * TResult  — the final result returned by the pipeline run (e.g. GenerationResult, PipelineResult).
 */
export interface IPipelineStrategy<TContext, TResult> {
  /**
   * Human-readable label emitted as the planning stage label in onStageStart.
   */
  planningLabel(intentOutput: unknown): string;

  /**
   * Whether the planning stage can be skipped for this invocation.
   * When true, runPlanning() will not be called.
   */
  canSkipPlanning(): boolean;

  /**
   * Runs the planning stage.
   * Returns the planning context (TContext) to be passed to runExecution().
   */
  runPlanning(
    userPrompt: string,
    intentOutput: unknown,
    callbacks: UnifiedPipelineCallbacks,
    options?: Record<string, unknown>,
  ): Promise<TContext>;

  /**
   * Runs the execution stage using the plan produced by runPlanning().
   * Returns the final result (TResult).
   */
  runExecution(
    userPrompt: string,
    intentOutput: unknown,
    planContext: TContext | null,
    callbacks: UnifiedPipelineCallbacks,
    options?: Record<string, unknown>,
  ): Promise<TResult>;
}
