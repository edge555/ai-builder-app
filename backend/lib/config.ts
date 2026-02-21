import { z } from 'zod';
import { createLogger } from './logger';
import {
  DIFF_CONTEXT_LINES,
  MAX_COMPONENT_LINES,
  MAX_APP_LINES,
  API_REQUEST_TIMEOUT,
  GEMINI_TIMEOUT,
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
  AI_PROVIDER: z.enum(['gemini', 'modal']).default('gemini'),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_EASY_MODEL: z.string().default('gemini-2.5-flash-lite'),
  GEMINI_HARD_MODEL: z.string().default('gemini-2.5-flash'),
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
export function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    result.error.issues.forEach((issue) => {
      console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
    });
    throw new Error('Invalid environment configuration');
  }

  const data = result.data;

  // Conditional validation: require provider-specific vars
  if (data.AI_PROVIDER === 'gemini' && !data.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required when AI_PROVIDER=gemini');
  }
  if (data.AI_PROVIDER === 'modal' && !data.MODAL_API_URL) {
    throw new Error('MODAL_API_URL is required when AI_PROVIDER=modal');
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
  ai: {
    maxOutputTokens: number;
    temperature: number;
    model: string;
    easyModel: string;
    hardModel: string;
  };
  provider: {
    name: 'gemini' | 'modal';
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
    maxRetries: 3,
    retryBaseDelay: 1000,
  },
  ai: {
    maxOutputTokens: env.MAX_OUTPUT_TOKENS,
    temperature: 0.7,
    model: env.GEMINI_MODEL,
    easyModel: env.GEMINI_EASY_MODEL,
    hardModel: env.GEMINI_HARD_MODEL,
  },
  provider: {
    name: env.AI_PROVIDER,
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
  ...(config.provider.name === 'modal' && {
    modalApiUrl: config.provider.modalApiUrl,
    modalStreamApiUrl: config.provider.modalStreamApiUrl,
    hasModalApiKey: !!config.provider.modalApiKey,
  }),
  ...(config.provider.name === 'gemini' && {
    geminiModel: config.ai.model,
    geminiEasyModel: config.ai.easyModel,
    geminiHardModel: config.ai.hardModel,
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

// Re-export constants for convenience
export {
  DIFF_CONTEXT_LINES,
  MAX_PRIMARY_SLICES,
  MAX_CONTEXT_SLICES,
  MAX_COMPONENT_LINES,
  MAX_APP_LINES,
  API_REQUEST_TIMEOUT,
  GEMINI_TIMEOUT,
  VALID_CODE_EXTENSIONS,
  VALID_STYLE_EXTENSIONS,
} from './constants';
