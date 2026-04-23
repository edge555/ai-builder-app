/**
 * @module ai/ai-provider-factory
 * @description Factory for creating the active AI provider.
 * Returns a FallbackAIProvider via AgentRouter with task-specific model routing.
 *
 * The AgentRouter singleton is lazily initialized on first use and reset
 * when the provider setting changes.
 *
 * @requires ./agent-router - OpenRouter routing logic
 * @requires ../logger - Structured logging
 */

import type { AIProvider } from './ai-provider';
import type { TaskType } from './agent-config-types';
import { AgentRouter } from './agent-router';
import { OpenRouterClient } from './openrouter-client';
import { config } from '../config';
import { createLogger } from '../logger';

const logger = createLogger('ai-provider-factory');

// Singleton AgentRouter — initialized lazily on first use
let agentRouter: AgentRouter | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Resets provider singletons so they reinitialize on next use.
 */
export function resetProviderSingletons(): void {
  agentRouter = null;
  initPromise = null;
  logger.info('Provider singletons reset');
}

async function ensureInitialized(): Promise<void> {
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
 * Creates a one-off OpenRouterClient using a workspace-specific API key.
 * Bypasses the singleton AgentRouter — all pipeline stages use the execution
 * model for workspace members in v1.
 */
export function createWorkspaceProvider(apiKey: string): AIProvider {
  return new OpenRouterClient(config.provider.openrouterExecutionModel, { apiKey });
}

export async function createAIProvider(taskType: TaskType = 'execution'): Promise<AIProvider> {
  await ensureInitialized();
  logger.info('Creating OpenRouter provider', { taskType });
  return agentRouter!.createProviderForTask(taskType);
}


