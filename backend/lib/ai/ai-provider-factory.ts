/**
 * AI Provider Factory
 * Creates the appropriate AIProvider based on the AI_PROVIDER environment variable.
 */

import type { AIProvider } from './ai-provider';
import { createGeminiClient } from './gemini-client';
import { createModalClient } from './modal-client';
import { createLogger } from '../logger';

const logger = createLogger('ai-provider-factory');

type ProviderName = 'gemini' | 'modal';

function getProviderName(): ProviderName {
  const raw = process.env.AI_PROVIDER ?? 'gemini';
  if (raw !== 'gemini' && raw !== 'modal') {
    logger.error('Invalid AI_PROVIDER value', { value: raw });
    throw new Error(`Unknown AI_PROVIDER: "${raw}". Valid values are: gemini, modal`);
  }
  logger.debug('AI_PROVIDER detected', { provider: raw });
  return raw;
}

/**
 * Creates an AIProvider from the AI_PROVIDER env var.
 * Defaults to GeminiClient when AI_PROVIDER is unset.
 */
export function createAIProvider(model?: string): AIProvider {
  const provider = getProviderName();

  if (provider === 'modal') {
    logger.info('Initializing Modal AI Provider', { model, apiUrl: process.env.MODAL_API_URL });
    return createModalClient(model);
  }

  logger.info('Initializing Gemini AI Provider', { model });
  return createGeminiClient(model);
}

/**
 * Creates an AIProvider with an explicit model override.
 */
export function createAIProviderWithModel(model: string): AIProvider {
  return createAIProvider(model);
}
