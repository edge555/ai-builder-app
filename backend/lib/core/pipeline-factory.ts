/**
 * @module core/pipeline-factory
 * @description Factory functions for creating PipelineOrchestrator instances
 * and the wired-up generators/engines that use them.
 *
 * - `createPipelineOrchestrator()`: resolves 4 AI providers + prompt provider
 * - `createStreamingProjectGenerator()`: added in Phase 5.1
 * - `createModificationEngine()`: added in Phase 5.2
 *
 * @requires ../ai/ai-provider-factory - Per-task AI provider creation
 * @requires ../ai/provider-config-store - Runtime provider name resolution
 * @requires ./prompts/prompt-provider-factory - IPromptProvider factory
 * @requires ./pipeline-orchestrator - PipelineOrchestrator class
 */

import { createAIProvider } from '../ai/ai-provider-factory';
import { getEffectiveProvider } from '../ai/provider-config-store';
import { createPromptProvider } from './prompts/prompt-provider-factory';
import { PipelineOrchestrator } from './pipeline-orchestrator';
import { GenerationPipeline } from './generation-pipeline';

// Side-effect import: registers all prompt fragments so recipes can reference them
import './recipes/fragment-registry';

/**
 * Creates a fully-wired PipelineOrchestrator.
 *
 * Resolves 4 task-specific AI providers in parallel, then creates
 * the appropriate IPromptProvider for the active AI provider.
 *
 * Used by `createStreamingProjectGenerator()` and `createModificationEngine()`
 * in Phase 5.
 */
export async function createPipelineOrchestrator(): Promise<PipelineOrchestrator> {
  const [intentProvider, planningProvider, executionProvider, reviewProvider, providerName] =
    await Promise.all([
      createAIProvider('intent'),
      createAIProvider('planning'),
      createAIProvider('execution'),
      createAIProvider('review'),
      getEffectiveProvider(),
    ]);

  const promptProvider = createPromptProvider(providerName);

  return new PipelineOrchestrator(
    intentProvider,
    planningProvider,
    executionProvider,
    reviewProvider,
    promptProvider
  );
}

/**
 * Creates a fully-wired GenerationPipeline.
 *
 * Resolves 5 task-specific AI providers in parallel (intent, planning, execution, review, bugfix),
 * then creates the appropriate IPromptProvider for the active AI provider.
 */
export async function createGenerationPipeline(): Promise<GenerationPipeline> {
  const [
    intentProvider,
    planningProvider,
    executionProvider,
    reviewProvider,
    bugfixProvider,
    providerName,
  ] = await Promise.all([
    createAIProvider('intent'),
    createAIProvider('planning'),
    createAIProvider('execution'),
    createAIProvider('review'),
    createAIProvider('bugfix'),
    getEffectiveProvider(),
  ]);

  const promptProvider = createPromptProvider(providerName);

  return new GenerationPipeline(
    intentProvider,
    planningProvider,
    executionProvider,
    reviewProvider,
    bugfixProvider,
    promptProvider
  );
}
