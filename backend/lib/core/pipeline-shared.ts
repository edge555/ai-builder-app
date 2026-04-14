/**
 * @module core/pipeline-shared
 * @description Shared types and utilities used by both GenerationStrategy and ModificationStrategy
 * (and their host UnifiedPipeline). Extracted to eliminate duplication across the two pipelines.
 */

import type { AIProvider } from '../ai/ai-provider';
import type { IPromptProvider } from './prompts/prompt-provider';
import type { IntentOutput } from './schemas';
import { IntentOutputSchema } from './schemas';
import { toSimpleJsonSchema } from './zod-to-json-schema';
import { createLogger } from '../logger';
import { getStructuredParseError, parseStructuredOutput } from '../ai/structured-output';
import type { GeneratedFile } from './schemas';

export { type GeneratedFile };

const logger = createLogger('PipelineShared');

const INTENT_JSON_SCHEMA = toSimpleJsonSchema(IntentOutputSchema);

/** Stages emitted as SSE events. Bugfix is an internal loop — not a public stage. */
export type PipelineStage = 'intent' | 'planning' | 'execution';

/** Unified logger type (supports plain logger or logger.withRequestId result). */
export type PipelineLogger = ReturnType<typeof logger.withRequestId> | typeof logger;

/**
 * Unified callback interface — superset of both generation and modification callback types.
 * Optional fields allow callers to omit callbacks they don't need.
 */
export interface UnifiedPipelineCallbacks {
  /** Fired when a stage begins. `label` is a human-readable status string. */
  onStageStart?: (stage: string, label: string) => void;
  /** Fired when a stage completes successfully. */
  onStageComplete?: (stage: string) => void;
  /** Fired when a non-fatal stage fails (degraded mode — pipeline continues). */
  onStageFailed?: (stage: string, error: string) => void;
  /** Fired for each streaming chunk from the execution stage (modification pipeline). */
  onExecutionChunk?: (chunk: string, accumulatedLength: number) => void;
  /** Fired for each streaming progress update (generation pipeline). */
  onProgress?: (accumulatedLength: number) => void;
  /** Fired as each file becomes available during generation streaming. */
  onFileStream?: (file: GeneratedFile, isComplete: boolean) => void;
  /** Fired when a generation phase starts. */
  onPhaseStart?: (data: { phase: string; phaseIndex: number; totalPhases: number; filesInPhase: number }) => void;
  /** Fired when a generation phase completes. */
  onPhaseComplete?: (data: { phase: string; phaseIndex: number; filesGenerated: number; totalGenerated: number; totalPlanned: number }) => void;
  /** AbortSignal to cancel in-flight AI requests. */
  signal?: AbortSignal;
}

/**
 * Shared intent stage runner.
 * Extracted from both GenerationPipeline and PipelineOrchestrator — behavior is identical.
 *
 * On success: returns the parsed IntentOutput and fires onStageComplete.
 * On failure: logs a degraded warning, fires onStageFailed, and returns null (pipeline continues).
 */
export async function runIntentStage(
  userPrompt: string,
  intentProvider: AIProvider,
  promptProvider: IPromptProvider,
  callbacks: UnifiedPipelineCallbacks,
  contextLogger: PipelineLogger,
): Promise<IntentOutput | null> {
  callbacks.onStageStart?.('intent', 'Analyzing your request…');
  const stageStartMs = Date.now();
  contextLogger.debug('Intent stage start');

  try {
    const response = await intentProvider.generate({
      prompt: userPrompt,
      systemInstruction: promptProvider.getIntentSystemPrompt(),
      maxOutputTokens: promptProvider.tokenBudgets.intent,
      responseSchema: INTENT_JSON_SCHEMA,
      signal: callbacks.signal,
    });

    if (!response.success || !response.content) {
      throw new Error(response.error ?? 'Intent stage returned empty content');
    }

    const parsedResult = parseStructuredOutput(response.content, IntentOutputSchema, 'IntentOutput');
    if (!parsedResult.success) {
      const parseError = getStructuredParseError(parsedResult);
      throw new Error(parseError);
    }

    contextLogger.info('Intent stage complete', {
      complexity: parsedResult.data.complexity,
      features: parsedResult.data.features ?? [],
      durationMs: Date.now() - stageStartMs,
    });
    callbacks.onStageComplete?.('intent');
    return parsedResult.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    contextLogger.warn('Intent stage failed (degraded)', {
      error: message,
      stack: err instanceof Error ? err.stack : undefined,
    });
    callbacks.onStageFailed?.('intent', message);
    return null;
  }
}
