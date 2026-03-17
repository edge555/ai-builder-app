/**
 * @module ai/agent-router
 * @description Task-specific AI provider routing for the OpenRouter backend.
 * `AgentRouter` reads the persisted agent config and builds `FallbackAIProvider`
 * instances that try models in priority order. If one model fails, the next is tried.
 * Only used in OpenRouter mode — Modal mode bypasses this entirely.
 *
 * @requires ./agent-config-store - Persisted model configuration loader
 * @requires ./openrouter-client - Individual model clients
 * @requires ./ai-provider - AIProvider interface
 * @requires ./agent-config-types - TaskType and AgentConfig types
 * @requires ../metrics - Operation timing
 * @requires ../logger - Structured logging
 */

import { createLogger } from '../logger';
import { stateError, notFoundError, envVarError } from '@ai-app-builder/shared/utils';
import { config } from '../config';
import { load, getActiveModelsForTask } from './agent-config-store';
import { OpenRouterClient } from './openrouter-client';
import { OperationTimer, formatMetrics } from '../metrics';
import type { AIProvider, AIRequest, AIStreamingRequest, AIResponse } from './ai-provider';
import type { AgentConfig, TaskType } from './agent-config-types';

const logger = createLogger('agent-router');

/**
 * Returns the OPENROUTER_<TASK>_MODEL env override for a task type, or null if not set.
 * When set, this value is used as the sole model for the task, bypassing agent-config.json.
 */
function getEnvModelOverride(taskType: TaskType): string | null {
  const overrides: Record<TaskType, string> = {
    intent: config.provider.openrouterIntentModel,
    planning: config.provider.openrouterPlanningModel,
    execution: config.provider.openrouterExecutionModel,
    bugfix: config.provider.openrouterBugfixModel,
    review: config.provider.openrouterReviewModel,
  };
  // The config has defaults, so we check if the env var was explicitly set
  // by comparing against the default values. An override is "active" when
  // the env var is explicitly set in the environment (not just the schema default).
  const envVarNames: Record<TaskType, string> = {
    intent: 'OPENROUTER_INTENT_MODEL',
    planning: 'OPENROUTER_PLANNING_MODEL',
    execution: 'OPENROUTER_EXECUTION_MODEL',
    bugfix: 'OPENROUTER_BUGFIX_MODEL',
    review: 'OPENROUTER_REVIEW_MODEL',
  };
  const isExplicitlySet = !!process.env[envVarNames[taskType]];
  return isExplicitlySet ? overrides[taskType] : null;
}

/**
 * AgentRouter loads the persisted agent config and creates
 * FallbackAIProvider instances for each task type.
 */
export class AgentRouter {
  private agentConfig: AgentConfig | null = null;

  async init(): Promise<void> {
    this.agentConfig = await load();
    logger.info('AgentRouter initialized');
  }

  async reload(): Promise<void> {
    this.agentConfig = await load();
    logger.info('AgentRouter config reloaded');
  }

  createProviderForTask(taskType: TaskType): AIProvider {
    if (!this.agentConfig) {
      throw new Error(stateError('AgentRouter', 'not initialized — call init() first'));
    }

    const apiKey = config.provider.openrouterApiKey;
    if (!apiKey) {
      throw new Error(envVarError('OPENROUTER_API_KEY', 'required for OpenRouter provider'));
    }

    // Env var override takes full precedence over agent-config.json
    const envOverride = getEnvModelOverride(taskType);
    if (envOverride) {
      logger.debug('Using env var model override for task', { taskType, model: envOverride });
      const client = new OpenRouterClient(envOverride, {
        apiKey,
        timeout: config.provider.openrouterTimeout,
        maxRetries: config.api.maxRetries,
        retryBaseDelay: config.api.retryBaseDelay,
      });
      return new FallbackAIProvider(taskType, [envOverride], [client]);
    }

    const models = getActiveModelsForTask(this.agentConfig, taskType);

    if (models.length === 0) {
      throw new Error(notFoundError('Active models', `task type ${taskType}`));
    }

    const clients = models.map(
      (model) =>
        new OpenRouterClient(model.id, {
          apiKey,
          timeout: config.provider.openrouterTimeout,
          maxRetries: config.api.maxRetries,
          retryBaseDelay: config.api.retryBaseDelay,
        })
    );

    logger.debug('Created FallbackAIProvider', {
      taskType,
      models: models.map((m) => m.id),
    });

    return new FallbackAIProvider(taskType, models.map((m) => m.id), clients);
  }
}

/**
 * FallbackAIProvider tries multiple OpenRouterClient instances in order.
 * If one model fails, it falls through to the next.
 */
export class FallbackAIProvider implements AIProvider {
  constructor(
    private readonly taskType: TaskType,
    private readonly modelIds: string[],
    private readonly clients: OpenRouterClient[]
  ) { }

  async generate(request: AIRequest): Promise<AIResponse> {
    return this.runWithFallback('generate', request);
  }

  async generateStreaming(request: AIStreamingRequest): Promise<AIResponse> {
    return this.runWithFallback('generateStreaming', request);
  }

  private async runWithFallback(
    method: 'generate' | 'generateStreaming',
    request: AIRequest | AIStreamingRequest
  ): Promise<AIResponse> {
    const timer = new OperationTimer(`agent-router-${this.taskType}`, request.requestId);
    let lastResponse: AIResponse | null = null;

    for (let i = 0; i < this.clients.length; i++) {
      const modelId = this.modelIds[i];
      const attemptTimer = new OperationTimer(`agent-router-attempt-${modelId}`, request.requestId);

      logger.info(`[agent-router] Trying model`, {
        taskType: this.taskType,
        model: modelId,
        attempt: i + 1,
        total: this.clients.length,
      });

      let response: AIResponse;
      try {
        response = await this.clients[i][method](request as AIStreamingRequest);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        attemptTimer.complete(false);
        logger.warn(`[agent-router] Client threw for ${this.taskType} | Model: ${modelId} | Error: ${errorMsg}`);
        lastResponse = { success: false, error: errorMsg };
        continue;
      }
      lastResponse = response;

      const attemptMetrics = attemptTimer.complete(response.success);

      if (response.success) {
        logger.info(`[agent-router] Task: ${this.taskType} | Model: ${modelId} | Status: success | Latency: ${attemptMetrics.durationMs}ms`, {
          taskType: this.taskType,
          model: modelId,
          ...formatMetrics(attemptMetrics),
        });
        timer.complete(true);
        return response;
      }

      // Model failed — log and try next
      if (i < this.clients.length - 1) {
        logger.warn(`[agent-router] Fallback triggered: ${this.taskType} | Failed: ${modelId} | Next: ${this.modelIds[i + 1]}`, {
          taskType: this.taskType,
          failed: modelId,
          next: this.modelIds[i + 1],
          error: response.error,
          latency: attemptMetrics.durationMs,
        });
      } else {
        logger.error(`[agent-router] Task: ${this.taskType} | Model: ${modelId} | Status: failed | Latency: ${attemptMetrics.durationMs}ms`, {
          taskType: this.taskType,
          model: modelId,
          error: response.error,
          ...formatMetrics(attemptMetrics),
        });
      }
    }

    timer.complete(false);
    // All models failed — return the last response
    return lastResponse!;
  }
}
