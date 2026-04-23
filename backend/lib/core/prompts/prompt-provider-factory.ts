/**
 * @module core/prompts/prompt-provider-factory
 * @description Factory for creating the IPromptProvider implementation.
 *
 * @requires ./prompt-provider - IPromptProvider interface
 * @requires ./unified-prompt-provider - Single configurable implementation
 */

import type { IPromptProvider } from './prompt-provider';
import { UnifiedPromptProvider } from './unified-prompt-provider';

export function createPromptProvider(): IPromptProvider {
  return new UnifiedPromptProvider();
}
