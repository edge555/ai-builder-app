/**
 * Intent Detector
 *
 * Classifies a user prompt into a TaskType using the 'intent' models
 * configured in the agent config. Uses low temperature and few tokens
 * for fast, deterministic classification.
 *
 * Only used in OpenRouter mode.
 */

import { createLogger } from '../logger';
import { OperationTimer, formatMetrics } from '../metrics';
import type { AgentRouter } from './agent-router';
import type { TaskType } from './agent-config-types';

const logger = createLogger('intent-detector');

const FALLBACK_TASK: TaskType = 'coding';

const VALID_TASK_TYPES: TaskType[] = ['coding', 'debugging', 'planning', 'documentation'];

const SYSTEM_PROMPT = `You are a task classifier. Given a user prompt, output exactly one word — the task type.

Task types:
- coding: writing new features, components, UI, or any new code
- debugging: fixing bugs, errors, broken behaviour, or unexpected output
- planning: high-level analysis, architecture decisions, or planning what to build
- documentation: writing comments, README files, or explaining existing code

Rules:
- Output ONLY the single word (coding, debugging, planning, or documentation)
- No punctuation, no explanation, no extra words
- When in doubt, output: coding`;

export class IntentDetector {
  constructor(private readonly agentRouter: AgentRouter) { }

  async detect(prompt: string, requestId?: string): Promise<TaskType> {
    const timer = new OperationTimer('intent-detect', requestId);
    const contextLogger = requestId ? logger.withRequestId(requestId) : logger;

    let provider;
    try {
      provider = this.agentRouter.createProviderForTask('intent');
    } catch (err) {
      // No intent models configured — skip detection and default
      contextLogger.warn('Intent detection skipped: no active intent models', {
        error: err instanceof Error ? err.message : String(err),
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
        contextLogger.warn('Intent detection failed, defaulting to coding', {
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
    } catch (err) {
      const metrics = timer.complete(false, {
        error: err instanceof Error ? err.message : String(err),
      });
      contextLogger.warn('Intent detection threw, defaulting to coding', formatMetrics(metrics));
      return FALLBACK_TASK;
    }
  }
}
