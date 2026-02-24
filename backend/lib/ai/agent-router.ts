/**
 * Agent Router
 *
 * Creates task-specific AI providers that try models in priority order.
 * Used only in OpenRouter mode — Modal mode bypasses this entirely.
 */

import { createLogger } from '../logger';
import { config } from '../config';
import { load, getActiveModelsForTask } from './agent-config-store';
import { OpenRouterClient } from './openrouter-client';
import { OperationTimer, formatMetrics } from '../metrics';
import type { AIProvider, AIRequest, AIStreamingRequest, AIResponse } from './ai-provider';
import type { AgentConfig, TaskType } from './agent-config-types';

const logger = createLogger('agent-router');

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
      throw new Error('AgentRouter not initialized — call init() first');
    }

    const models = getActiveModelsForTask(this.agentConfig, taskType);

    if (models.length === 0) {
      throw new Error(`No active models configured for task type: ${taskType}`);
    }

    const apiKey = config.provider.openrouterApiKey;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured');
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

      const response = await this.clients[i][method](request as AIStreamingRequest);
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
