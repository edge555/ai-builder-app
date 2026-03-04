/**
 * @module config
 * @description Backend configuration loaded and validated at startup.
 * Reads environment variables via Zod, validates provider-specific
 * requirements, and exports a typed `config` object consumed across
 * the backend. Also exports `getMaxOutputTokens` for provider-aware
 * token limit selection.
 *
 * @requires zod - Schema validation for environment variables
 * @requires ./logger - Startup logging
 * @requires ./constants - Named constant values
 * @requires @ai-app-builder/shared/utils - Error message helpers
 */

import { z } from 'zod';
import { createLogger } from './logger';
import { validationError, envVarError } from '@ai-app-builder/shared/utils';
import {
  DEFAULT_API_MAX_RETRIES,
  DEFAULT_RETRY_BASE_DELAY_MS,
  DIFF_CONTEXT_LINES,
  MAX_COMPONENT_LINES,
  MAX_APP_LINES,
  API_REQUEST_TIMEOUT,
  OPENROUTER_TIMEOUT,
  MAX_OUTPUT_TOKENS_GENERATION,
  MAX_OUTPUT_TOKENS_MODIFICATION,
  MAX_OUTPUT_TOKENS_PLANNING,
  MODAL_MAX_OUTPUT_TOKENS_GENERATION,
  MODAL_MAX_OUTPUT_TOKENS_MODIFICATION,
  MODAL_MAX_OUTPUT_TOKENS_PLANNING,
} from './constants';

const logger = createLogger('config');

/**
 * Zod schema for backend environment variables.
 */
const envSchema = z.object({
  AI_PROVIDER: z.enum(['modal', 'openrouter']).default('openrouter'),
  OPENROUTER_API_KEY: z.string().optional(),
  MODAL_API_URL: z.string().url().optional(),
  MODAL_STREAM_API_URL: z.string().url().optional(),
  MODAL_API_KEY: z.string().optional(),
  MAX_OUTPUT_TOKENS: z.coerce.number().default(16384),
  ALLOWED_ORIGINS: z.string().default('http://localhost:8080'),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

/**
 * Validates and returns environment variables.
 * Fails fast if required variables are missing or invalid.
 */
function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    result.error.issues.forEach((issue) => {
      console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
    });
    throw new Error(validationError('environment configuration', result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')));
  }

  const data = result.data;

  // Conditional validation: require provider-specific vars
  if (data.AI_PROVIDER === 'openrouter' && !data.OPENROUTER_API_KEY) {
    throw new Error(envVarError('OPENROUTER_API_KEY', 'required when AI_PROVIDER=openrouter'));
  }
  if (data.AI_PROVIDER === 'modal' && !data.MODAL_API_URL) {
    throw new Error(envVarError('MODAL_API_URL', 'required when AI_PROVIDER=modal'));
  }

  return data;
}

// Validate environment variables early
const env = validateEnv();

export interface BackendConfig {
  cors: {
    allowedOrigins: string[];
    methods: string[];
    headers: string[];
  };
  api: {
    timeout: number;
    maxRetries: number;
    retryBaseDelay: number;
  };
  provider: {
    name: 'modal' | 'openrouter';
    openrouterApiKey?: string;
    openrouterTimeout: number;
    modalApiUrl?: string;
    modalStreamApiUrl?: string;
    modalApiKey?: string;
  };
  validation: {
    maxComponentLines: number;
    maxAppLines: number;
    contextLines: number;
  };
}

export const config: BackendConfig = {
  cors: {
    allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    headers: [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
      'X-Requested-With',
      'Accept',
      'Accept-Version',
      'Content-Length',
      'Content-MD5',
      'Date',
      'X-Api-Version',
      'apikey',
    ],
  },
  api: {
    timeout: API_REQUEST_TIMEOUT,
    maxRetries: DEFAULT_API_MAX_RETRIES,
    retryBaseDelay: DEFAULT_RETRY_BASE_DELAY_MS,
  },
  provider: {
    name: env.AI_PROVIDER,
    openrouterApiKey: env.OPENROUTER_API_KEY,
    openrouterTimeout: OPENROUTER_TIMEOUT,
    modalApiUrl: env.MODAL_API_URL,
    modalStreamApiUrl: env.MODAL_STREAM_API_URL,
    modalApiKey: env.MODAL_API_KEY,
  },
  validation: {
    maxComponentLines: MAX_COMPONENT_LINES,
    maxAppLines: MAX_APP_LINES,
    contextLines: DIFF_CONTEXT_LINES,
  },
};

// Log configuration on startup
logger.info('Backend configuration loaded', {
  aiProvider: config.provider.name,
  ...(config.provider.name === 'openrouter' && {
    hasOpenrouterApiKey: !!config.provider.openrouterApiKey,
  }),
  ...(config.provider.name === 'modal' && {
    modalApiUrl: config.provider.modalApiUrl,
    modalStreamApiUrl: config.provider.modalStreamApiUrl,
    hasModalApiKey: !!config.provider.modalApiKey,
  }),
});

/**
 * Returns the max output tokens for the given operation type,
 * selecting provider-specific limits based on the active AI provider.
 */
export function getMaxOutputTokens(
  operationType: 'generation' | 'modification' | 'planning'
): number {
  if (config.provider.name === 'modal') {
    return {
      generation: MODAL_MAX_OUTPUT_TOKENS_GENERATION,
      modification: MODAL_MAX_OUTPUT_TOKENS_MODIFICATION,
      planning: MODAL_MAX_OUTPUT_TOKENS_PLANNING,
    }[operationType];
  }
  return {
    generation: MAX_OUTPUT_TOKENS_GENERATION,
    modification: MAX_OUTPUT_TOKENS_MODIFICATION,
    planning: MAX_OUTPUT_TOKENS_PLANNING,
  }[operationType];
}

