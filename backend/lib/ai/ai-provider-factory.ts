/**
 * @module ai/ai-provider-factory
 * @description Factory for creating the active AI provider.
 * Reads the effective provider (settings override or env var) and returns
 * the appropriate `AIProvider` implementation:
 * - `modal` → `ModalClient` (direct FastAPI endpoint)
 * - `openrouter` → `FallbackAIProvider` via `AgentRouter` (task-specific model routing)
 *
 * Singletons for `AgentRouter` and `IntentDetector` are lazily initialized
 * on first use and reset when the provider setting changes.
 *
 * @requires ./modal-client - Modal provider implementation
 * @requires ./agent-router - OpenRouter routing logic
 * @requires ./intent-detector - Prompt task classification
 * @requires ./provider-config-store - Runtime provider override
 * @requires ../logger - Structured logging
 */

import type { AIProvider } from './ai-provider';
import type { TaskType } from './agent-config-types';
import { createModalClientForTask } from './modal-pipeline-factory';
import { AgentRouter } from './agent-router';
import { getEffectiveProvider } from './provider-config-store';
import { OpenRouterClient } from './openrouter-client';
import { config } from '../config';
import { createLogger } from '../logger';

const logger = createLogger('ai-provider-factory');

// Singleton AgentRouter — initialized lazily on first use (OpenRouter mode only)
let agentRouter: AgentRouter | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Resets provider singletons so they reinitialize on next use.
 * Called when the provider setting changes at runtime.
 */
export function resetProviderSingletons(): void {
  agentRouter = null;
  initPromise = null;
  logger.info('Provider singletons reset');
}

/**
 * Ensures the AgentRouter is initialized (once). No-op in Modal mode.
 */
async function ensureInitialized(): Promise<void> {
  const provider = await getEffectiveProvider();
  if (provider !== 'openrouter') return;

  if (!initPromise) {
    initPromise = (async () => {
      agentRouter = new AgentRouter();
      await agentRouter.init();
      logger.info('AgentRouter initialized');
    })();
  }

  await initPromise;
}

/**
 * Creates an AIProvider for the given task type.
 *
 * - Modal mode: ignores taskType, returns a ModalClient
 * - OpenRouter mode: returns a FallbackAIProvider for the task type via AgentRouter
 *
 * Uses settings override if set, otherwise falls back to AI_PROVIDER env var.
 */
/**
 * Creates a one-off OpenRouterClient using a workspace-specific API key.
 * Bypasses the singleton AgentRouter and IntentDetector — all pipeline stages
 * use a single model (execution model) for workspace members in v1.
 * Task-specific routing for workspace members is a v2 enhancement.
 */
export function createWorkspaceProvider(apiKey: string): AIProvider {
    return new OpenRouterClient(config.provider.openrouterExecutionModel, { apiKey });
}

export async function createAIProvider(taskType: TaskType = 'execution'): Promise<AIProvider> {
  const provider = await getEffectiveProvider();
  if (provider === 'modal') {
    logger.info('Initializing Modal AI Provider', { taskType });
    return createModalClientForTask(taskType);
  }

  await ensureInitialized();
  logger.info('Creating OpenRouter provider', { taskType });
  return agentRouter!.createProviderForTask(taskType);
}


