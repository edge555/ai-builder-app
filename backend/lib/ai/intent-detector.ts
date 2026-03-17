/**
 * @module ai/intent-detector
 * @description Classifies user prompts into `TaskType` values for model routing.
 * Calls the `intent` task models configured in agent config with a low-token,
 * low-temperature request for fast deterministic classification.
 * Falls back to `execution` when no intent models are configured or on any failure.
 * Only used in OpenRouter mode.
 *
 * @requires ./agent-router - AgentRouter for obtaining intent provider
 * @requires ./agent-config-types - TaskType
 * @requires ../metrics - Operation timing
 * @requires ../logger - Structured logging
 */

import { createLogger } from '../logger';
import { OperationTimer, formatMetrics } from '../metrics';
import type { AgentRouter } from './agent-router';
import type { TaskType } from './agent-config-types';

const logger = createLogger('intent-detector');

const FALLBACK_TASK: TaskType = 'execution';

// 'intent' and 'review' are pipeline-internal stages, not detectable from user prompts
const VALID_TASK_TYPES: TaskType[] = ['execution', 'bugfix', 'planning'];

const SYSTEM_PROMPT = `You are a task classifier. Given a user prompt, output exactly one word — the task type.

Task types:
- execution: writing new features, components, UI, or any new code
- bugfix: fixing bugs, errors, broken behaviour, or unexpected output
- planning: high-level analysis, architecture decisions, or planning what to build

Rules:
- Output ONLY the single word (execution, bugfix, or planning)
- No punctuation, no explanation, no extra words
- When in doubt, output: execution`;

export class IntentDetector {
  constructor(private readonly agentRouter: AgentRouter) { }

  async detect(prompt: string, requestId?: string): Promise<TaskType> {
    const timer = new OperationTimer('intent-detect', requestId);
    const contextLogger = requestId ? logger.withRequestId(requestId) : logger;

    let provider;
    try {
      provider = this.agentRouter.createProviderForTask('intent');
    } catch (error) {
      // No intent models configured — skip detection and default
      contextLogger.warn('Intent detection skipped: no active intent models', {
        error: error instanceof Error ? error.message : String(error),
      });
      return FALLBACK_TASK;
    }

    try {
      const response = await provider.generate({
        prompt,
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.1,
        maxOutputTokens: 50,
        requestId,
      });

      if (!response.success || !response.content) {
        contextLogger.warn('Intent detection failed, defaulting to execution', {
          error: response.error,
        });
        timer.complete(false, { error: response.error });
        return FALLBACK_TASK;
      }

      const raw = response.content.trim().toLowerCase();
      const detected = VALID_TASK_TYPES.find((t) => raw.includes(t)) ?? FALLBACK_TASK;

      const metrics = timer.complete(true);
      contextLogger.info(`[intent-detector] Prompt classified as: ${detected} | Model: ${response.modelId ?? 'unknown'} | Latency: ${metrics.durationMs}ms`, {
        ...formatMetrics(metrics),
        detected,
        raw,
        modelId: response.modelId,
      });

      return detected;
    } catch (error) {
      const metrics = timer.complete(false, {
        error: error instanceof Error ? error.message : String(error),
      });
      contextLogger.warn('Intent detection threw, defaulting to execution', formatMetrics(metrics));
      return FALLBACK_TASK;
    }
  }
}
