/**
 * @module config
 * @description Frontend configuration validated from Vite environment variables.
 * Validates required variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`)
 * at startup using Zod. Exports a typed `config` object with API and Supabase settings.
 * Missing variables are logged but do not crash the app (errors surface at point of use).
 *
 * @requires zod - Environment variable schema validation
 * @requires ./utils/logger - Startup validation logging
 */
import { z } from 'zod';

import { createLogger } from './utils/logger';

const configLogger = createLogger('Config');

/**
 * Zod schema for frontend environment variables.
 */
const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url('VITE_SUPABASE_URL must be a valid URL'),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1, 'VITE_SUPABASE_PUBLISHABLE_KEY is required'),
  VITE_API_BASE_URL: z.string().url('VITE_API_BASE_URL must be a valid URL').optional().default('http://localhost:4000'),
});

/**
 * Validates and returns environment variables.
 * Fails fast if required variables are missing or invalid.
 */
function validateEnv() {
  const result = envSchema.safeParse(import.meta.env);

  if (!result.success) {
    configLogger.error('Invalid environment variables');
    result.error.issues.forEach((issue) => {
      configLogger.error(`   - ${issue.path.join('.')}: ${issue.message}`);
    });
    // In frontend, we'll return the error-prone values but they will be caught by 
    // the application if it uses them. We don't throw here to avoid 
    // blocking the entire app start unless absolutely necessary.
  }

  return result.success ? result.data : {} as z.infer<typeof envSchema>;
}

// Validate environment variables early
const env = validateEnv();

export interface FrontendConfig {
  api: {
    baseUrl: string;
    timeout: number;
  };
  supabase: {
    url: string;
    key: string;
  };
}

export const config: FrontendConfig = {
  api: {
    baseUrl: env.VITE_API_BASE_URL || '',
    timeout: 65000,
  },
  supabase: {
    url: env.VITE_SUPABASE_URL || '',
    key: env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
  },
};
