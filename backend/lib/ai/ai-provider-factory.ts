/**
 * AI Provider Factory
 *
 * Creates the appropriate AIProvider based on the AI_PROVIDER environment variable.
 * - Modal mode: returns a simple ModalClient (existing behavior)
 * - OpenRouter mode: uses AgentRouter for task-specific model routing with fallback
 */

import type { AIProvider } from './ai-provider';
import type { TaskType } from './agent-config-types';
import { createModalClient } from './modal-client';
import { AgentRouter } from './agent-router';
import { IntentDetector } from './intent-detector';
import { getEffectiveProvider } from './provider-config-store';
import { createLogger } from '../logger';

const logger = createLogger('ai-provider-factory');

// Singleton AgentRouter & IntentDetector — initialized lazily on first use (OpenRouter mode only)
let agentRouter: AgentRouter | null = null;
let intentDetector: IntentDetector | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Resets provider singletons so they reinitialize on next use.
 * Called when the provider setting changes at runtime.
 */
export function resetProviderSingletons(): void {
  agentRouter = null;
  intentDetector = null;
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
      intentDetector = new IntentDetector(agentRouter);
      logger.info('AgentRouter and IntentDetector initialized');
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
export async function createAIProvider(taskType: TaskType = 'coding'): Promise<AIProvider> {
  const provider = await getEffectiveProvider();
  if (provider === 'modal') {
    logger.info('Initializing Modal AI Provider');
    return createModalClient();
  }

  await ensureInitialized();
  logger.info('Creating OpenRouter provider', { taskType });
  return agentRouter!.createProviderForTask(taskType);
}

/**
 * Detects the intent (task type) of a user prompt.
 *
 * - Modal mode: always returns 'coding' (no intent detection)
 * - OpenRouter mode: classifies the prompt via IntentDetector
 *
 * Uses settings override if set, otherwise falls back to AI_PROVIDER env var.
 */
export async function detectIntent(prompt: string, requestId?: string): Promise<TaskType> {
  const provider = await getEffectiveProvider();
  if (provider === 'modal') {
    return 'coding';
  }

  await ensureInitialized();
  return intentDetector!.detect(prompt, requestId);
}

/**
 * Reloads the agent configuration from disk.
 * Useful after the settings page saves a new config.
 */
async function reloadAgentConfig(): Promise<void> {
  if (agentRouter) {
    await agentRouter.reload();
    logger.info('Agent config reloaded');
  }
}
