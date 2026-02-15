import { z } from 'zod';
import {
  DIFF_CONTEXT_LINES,
  MAX_COMPONENT_LINES,
  MAX_APP_LINES,
  API_REQUEST_TIMEOUT,
  GEMINI_TIMEOUT,
} from './constants';

/**
 * Zod schema for backend environment variables.
 */
const envSchema = z.object({
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required for project generation'),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_EASY_MODEL: z.string().default('gemini-2.5-flash-lite'),
  GEMINI_HARD_MODEL: z.string().default('gemini-2.5-flash'),
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
    // In a real production app, we might process.exit(1) here
    // For now, we'll throw to let Next.js handle it or log it clearly
    throw new Error('Invalid environment configuration');
  }

  return result.data;
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
  validation: {
    maxComponentLines: MAX_COMPONENT_LINES,
    maxAppLines: MAX_APP_LINES,
    contextLines: DIFF_CONTEXT_LINES,
  },
};

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
