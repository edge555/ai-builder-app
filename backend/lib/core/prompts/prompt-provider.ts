/**
 * @module core/prompts/prompt-provider
 * @description IPromptProvider interface — implemented by ApiPromptProvider (OpenRouter)
 * and ModalPromptProvider (Modal). Each implementation provides system prompts and
 * token budgets appropriate for its provider.
 *
 * @requires ./schemas - IntentOutput, PlanOutput types (via ../../core/schemas)
 */

import type { IntentOutput, PlanOutput } from '../schemas';

export type { IntentOutput, PlanOutput };

/**
 * Unified prompt interface for the 4-stage pipeline.
 *
 * All methods return a system instruction string ready to be passed directly
 * to the AI provider. User-turn content is assembled separately by the orchestrator.
 *
 * Token budgets are advisory — passed as `maxOutputTokens` in AIRequest.
 */
export interface IPromptProvider {
  /** System prompt for the intent-classification stage (returns IntentOutput JSON). */
  getIntentSystemPrompt(): string;

  /**
   * System prompt for the planning stage (returns PlanOutput JSON).
   * Receives clarified intent when available.
   */
  getPlanningSystemPrompt(userPrompt: string, intent: IntentOutput | null): string;

  /**
   * System prompt for execution — new project generation (returns ProjectOutput JSON).
   * Receives clarified intent and plan when available to guide file structure.
   */
  getExecutionGenerationSystemPrompt(
    userPrompt: string,
    intent: IntentOutput | null,
    plan: PlanOutput | null
  ): string;

  /**
   * System prompt for execution — project modification (returns ModificationOutput JSON).
   * Receives clarified intent, plan, and a flag indicating design-system keywords were detected.
   */
  getExecutionModificationSystemPrompt(
    userPrompt: string,
    intent: IntentOutput | null,
    plan: PlanOutput | null,
    designSystem: boolean
  ): string;

  /** System prompt for the review stage (returns ReviewOutput JSON). */
  getReviewSystemPrompt(): string;

  /**
   * System prompt for the bugfix loop.
   * Receives formatted build error text and previous attempt descriptions.
   */
  getBugfixSystemPrompt(errorContext: string, failureHistory: string[]): string;

  /**
   * Per-stage output token budgets.
   * The orchestrator passes these as `maxOutputTokens` in each AI request.
   */
  tokenBudgets: {
    intent: number;
    planning: number;
    executionGeneration: number;
    executionModification: number;
    review: number;
    bugfix: number;
  };
}
