/**
 * @module core/prompts/prompt-provider-factory
 * @description Factory for creating the active IPromptProvider implementation.
 * Both providers use UnifiedPromptProvider — Modal overrides token budgets
 * and enables verbose guidance; API uses defaults.
 *
 * @requires ./prompt-provider - IPromptProvider interface
 * @requires ./unified-prompt-provider - Single configurable implementation
 */

import type { IPromptProvider } from './prompt-provider';
import { UnifiedPromptProvider } from './unified-prompt-provider';
import {
  MODAL_MAX_OUTPUT_TOKENS_INTENT,
  MODAL_MAX_OUTPUT_TOKENS_PLANNING_STAGE,
} from '../../constants';

/**
 * Creates the appropriate IPromptProvider for the given AI provider.
 *
 * @param providerName - 'openrouter' for API path, 'modal' for self-hosted path
 */
export function createPromptProvider(providerName: 'modal' | 'openrouter'): IPromptProvider {
  if (providerName === 'modal') {
    return new UnifiedPromptProvider({
      tokenBudgetOverrides: {
        intent: MODAL_MAX_OUTPUT_TOKENS_INTENT,           // 1024 vs 512
        planning: MODAL_MAX_OUTPUT_TOKENS_PLANNING_STAGE, // 8192 vs 4096
      },
      verboseGuidance: true,
    });
  }
  return new UnifiedPromptProvider();
}
