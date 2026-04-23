/**
 * @module core/pipeline-factory
 * @description Factory functions for creating UnifiedPipeline instances wired with the
 * appropriate strategy (GenerationStrategy or ModificationStrategy).
 *
 * - `createGenerationPipeline()`: returns UnifiedPipeline<ArchitecturePlan, GenerationResult>
 * - `createModificationPipeline()`: returns UnifiedPipeline<PlanOutput, PipelineResult>
 * - `createPipelineOrchestrator`: backward-compat alias for createModificationPipeline
 *
 * @requires ../ai/ai-provider-factory - Per-task AI provider creation
 * @requires ../ai/provider-config-store - Runtime provider name resolution
 * @requires ./prompts/prompt-provider-factory - IPromptProvider factory
 * @requires ./unified-pipeline - UnifiedPipeline class
 * @requires ./generation-strategy - GenerationStrategy class
 * @requires ./modification-strategy - ModificationStrategy class
 */

import { createAIProvider } from '../ai/ai-provider-factory';
import { createPromptProvider } from './prompts/prompt-provider-factory';
import { UnifiedPipeline } from './unified-pipeline';
import { GenerationStrategy } from './generation-strategy';
import { ModificationStrategy } from './modification-strategy';
import type { ArchitecturePlan } from './prompts/prompt-provider';
import type { PlanOutput } from './schemas';
import type { GenerationResult } from './generation-strategy';
import type { PipelineResult } from './modification-strategy';
import type { CodeSlice } from '../analysis/file-planner/types';

// Side-effect import: registers all prompt fragments so recipes can reference them
import './recipes/fragment-registry';

/**
 * Creates a fully-wired UnifiedPipeline for new project generation.
 *
 * Resolves 5 task-specific AI providers in parallel (intent, planning, execution, review, bugfix),
 * then creates the appropriate IPromptProvider for the active AI provider.
 */
export async function createGenerationPipeline(): Promise<UnifiedPipeline<ArchitecturePlan, GenerationResult>> {
  const [
    intentProvider,
    planningProvider,
    executionProvider,
    reviewProvider,
    bugfixProvider,
  ] = await Promise.all([
    createAIProvider('intent'),
    createAIProvider('planning'),
    createAIProvider('execution'),
    createAIProvider('review'),
    createAIProvider('bugfix'),
  ]);

  const promptProvider = createPromptProvider();

  const strategy = new GenerationStrategy(
    planningProvider,
    executionProvider,
    reviewProvider,
    bugfixProvider,
    promptProvider,
  );

  return new UnifiedPipeline(intentProvider, promptProvider, strategy);
}

/**
 * Creates a fully-wired UnifiedPipeline for modifying an existing project.
 *
 * Resolves 3 task-specific AI providers in parallel (intent, planning, execution).
 * Review stage has been removed — accuracy improvements (replace_file bias +
 * auto-fallback) make it redundant.
 *
 * @param currentFiles  Current project files (path → content)
 * @param fileSlices    Relevant code slices pre-selected by FilePlanner
 * @param tiers         Optional topological tiers for ordered execution
 * @param validateFile  Optional per-file validation callback (required when tiers is set)
 */
export async function createModificationPipeline(
  currentFiles: Record<string, string>,
  fileSlices: CodeSlice[],
  tiers?: string[][],
  validateFile?: (path: string, content: string) => Promise<{ valid: boolean; errorText?: string }>,
): Promise<UnifiedPipeline<PlanOutput, PipelineResult>> {
  const [intentProvider, planningProvider, executionProvider] =
    await Promise.all([
      createAIProvider('intent'),
      createAIProvider('planning'),
      createAIProvider('execution'),
    ]);

  const promptProvider = createPromptProvider();

  const strategy = new ModificationStrategy(
    planningProvider,
    executionProvider,
    promptProvider,
    currentFiles,
    fileSlices,
    tiers,
    validateFile,
  );

  return new UnifiedPipeline(intentProvider, promptProvider, strategy);
}

/**
 * Backward-compatibility alias.
 * Callers that previously used createPipelineOrchestrator() for modification pipelines
 * should migrate to createModificationPipeline(), but this alias avoids breaking changes
 * in code that constructs the pipeline externally and then passes currentFiles/fileSlices
 * directly to runModificationPipeline().
 *
 * NOTE: The returned UnifiedPipeline is constructed without currentFiles/fileSlices —
 * those are passed at run-time via the runModificationPipeline() alias. This is preserved
 * for the ModificationEngine which constructs the pipeline once and then passes slices
 * at call time through the legacy aliases.
 */
export async function createPipelineOrchestrator(): Promise<UnifiedPipeline<PlanOutput, PipelineResult>> {
  const [intentProvider, planningProvider, executionProvider] =
    await Promise.all([
      createAIProvider('intent'),
      createAIProvider('planning'),
      createAIProvider('execution'),
    ]);

  const promptProvider = createPromptProvider();

  // Empty slices/files — ModificationEngine passes them at call time via
  // the runModificationPipeline() / runOrderedModificationPipeline() aliases.
  const strategy = new ModificationStrategy(
    planningProvider,
    executionProvider,
    promptProvider,
    {},   // currentFiles — injected at run time via legacy alias
    [],   // fileSlices  — injected at run time via legacy alias
  );

  return new UnifiedPipeline(intentProvider, promptProvider, strategy);
}
