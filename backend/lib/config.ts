/**
 * @module config
 * @description Backend configuration loaded and validated at startup.
 * Reads environment variables via Zod, validates provider-specific
 * requirements, and exports a typed `config` object consumed across
 * the backend. Also exports `getMaxOutputTokens` for operation-type token limit selection.
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
  MAX_OUTPUT_TOKENS_INTENT,
  MAX_OUTPUT_TOKENS_PLANNING_STAGE,
  RATE_LIMIT_HIGH_COST_MAX,
  RATE_LIMIT_MEDIUM_COST_MAX,
  RATE_LIMIT_LOW_COST_MAX,
  RATE_LIMIT_CONFIG_MAX,
  RATE_LIMIT_WINDOW_MS,
} from './constants';

const logger = createLogger('config');

/**
 * Zod schema for backend environment variables.
 */
const envSchema = z.object({
  OPENROUTER_API_KEY: z.string().optional(),
  // OpenRouter per-task model overrides (take precedence over agent-config.json)
  OPENROUTER_INTENT_MODEL: z.string().default('thudm/glm-4.5-air'),
  OPENROUTER_PLANNING_MODEL: z.string().default('google/gemini-2.5-flash'),
  OPENROUTER_EXECUTION_MODEL: z.string().default('google/gemini-2.5-flash'),
  OPENROUTER_BUGFIX_MODEL: z.string().default('thudm/glm-5'),
  OPENROUTER_REVIEW_MODEL: z.string().default('thudm/glm-5'),
  MAX_OUTPUT_TOKENS: z.coerce.number().default(16384),
  ALLOWED_ORIGINS: z.string().default('http://localhost:8080'),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  RATE_LIMIT_ENABLED: z
    .string()
    .transform((v) => v !== 'false' && v !== '0')
    .default(true),
  SUPABASE_JWT_SECRET: z.string().optional(),
  TRUSTED_PROXY_DEPTH: z.coerce.number().int().min(0).default(1),
  REDIS_URL: z.string().url().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default('uploads'),
  ENABLE_FULLSTACK_RECIPES: z
    .string()
    .transform((v) => v === 'true' || v === '1')
    .default(false),
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

  if (!data.OPENROUTER_API_KEY) {
    throw new Error(envVarError('OPENROUTER_API_KEY', 'required'));
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
    name: 'openrouter';
    openrouterApiKey?: string;
    openrouterTimeout: number;
    openrouterIntentModel: string;
    openrouterPlanningModel: string;
    openrouterExecutionModel: string;
    openrouterBugfixModel: string;
    openrouterReviewModel: string;
  };
  validation: {
    maxComponentLines: number;
    maxAppLines: number;
    contextLines: number;
  };
  rateLimit: {
    enabled: boolean;
    windowMs: number;
    highCostMax: number;
    mediumCostMax: number;
    lowCostMax: number;
    configMax: number;
  };
  security: {
    trustedProxyDepth: number;
  };
  redis: {
    url?: string;
  };
  storage: {
    supabaseUrl?: string;
    supabaseServiceRoleKey?: string;
    storageBucket: string;
  };
  auth: {
    supabaseJwtSecret?: string;
  };
  recipes: {
    fullstackEnabled: boolean;
  };
  session: {
    contextK: number;
    contextMaxTokens: number;
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
    name: 'openrouter',
    openrouterApiKey: env.OPENROUTER_API_KEY,
    openrouterTimeout: OPENROUTER_TIMEOUT,
    openrouterIntentModel: env.OPENROUTER_INTENT_MODEL,
    openrouterPlanningModel: env.OPENROUTER_PLANNING_MODEL,
    openrouterExecutionModel: env.OPENROUTER_EXECUTION_MODEL,
    openrouterBugfixModel: env.OPENROUTER_BUGFIX_MODEL,
    openrouterReviewModel: env.OPENROUTER_REVIEW_MODEL,
  },
  validation: {
    maxComponentLines: MAX_COMPONENT_LINES,
    maxAppLines: MAX_APP_LINES,
    contextLines: DIFF_CONTEXT_LINES,
  },
  rateLimit: {
    enabled: env.RATE_LIMIT_ENABLED,
    windowMs: RATE_LIMIT_WINDOW_MS,
    highCostMax: RATE_LIMIT_HIGH_COST_MAX,
    mediumCostMax: RATE_LIMIT_MEDIUM_COST_MAX,
    lowCostMax: RATE_LIMIT_LOW_COST_MAX,
    configMax: RATE_LIMIT_CONFIG_MAX,
  },
  security: {
    trustedProxyDepth: env.TRUSTED_PROXY_DEPTH,
  },
  redis: {
    url: env.REDIS_URL,
  },
  storage: {
    supabaseUrl: env.SUPABASE_URL,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    storageBucket: env.SUPABASE_STORAGE_BUCKET,
  },
  auth: {
    supabaseJwtSecret: env.SUPABASE_JWT_SECRET,
  },
  recipes: {
    fullstackEnabled: env.ENABLE_FULLSTACK_RECIPES,
  },
  session: {
    contextK: env.SESSION_CONTEXT_K,
    contextMaxTokens: env.SESSION_CONTEXT_MAX_TOKENS,
  },
};

// Log configuration on startup
logger.info('Backend configuration loaded', {
  aiProvider: config.provider.name,
  hasOpenrouterApiKey: !!config.provider.openrouterApiKey,
  intentModel: config.provider.openrouterIntentModel,
  planningModel: config.provider.openrouterPlanningModel,
  executionModel: config.provider.openrouterExecutionModel,
  bugfixModel: config.provider.openrouterBugfixModel,
  reviewModel: config.provider.openrouterReviewModel,
});

/**
 * Returns the max output tokens for the given operation type,
 * selecting provider-specific limits based on the active AI provider.
 */
export function getMaxOutputTokens(
  operationType: 'generation' | 'modification' | 'planning' | 'intent' | 'planning_stage'
): number {
  return {
    generation: MAX_OUTPUT_TOKENS_GENERATION,
    modification: MAX_OUTPUT_TOKENS_MODIFICATION,
    planning: MAX_OUTPUT_TOKENS_PLANNING,
    intent: MAX_OUTPUT_TOKENS_INTENT,
    planning_stage: MAX_OUTPUT_TOKENS_PLANNING_STAGE,
  }[operationType];
}

