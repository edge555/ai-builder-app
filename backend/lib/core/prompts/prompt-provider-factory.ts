/**
 * @module core/prompts/prompt-provider-factory
 * @description Factory for creating the active IPromptProvider implementation.
 * - openrouter → ApiPromptProvider (concise prompts, lower token budgets)
 * - modal → ModalPromptProvider (verbose prompts, full guidance, higher token budgets)
 *
 * @requires ./prompt-provider - IPromptProvider interface
 * @requires ./api/api-prompt-provider - OpenRouter implementation
 * @requires ./modal/modal-prompt-provider - Modal implementation
 */

import type { IPromptProvider } from './prompt-provider';
import { ApiPromptProvider } from './api/api-prompt-provider';
import { ModalPromptProvider } from './modal/modal-prompt-provider';

/**
 * Creates the appropriate IPromptProvider for the given AI provider.
 *
 * @param providerName - 'openrouter' for API path, 'modal' for self-hosted path
 */
export function createPromptProvider(providerName: 'modal' | 'openrouter'): IPromptProvider {
  if (providerName === 'modal') {
    return new ModalPromptProvider();
  }
  return new ApiPromptProvider();
}
