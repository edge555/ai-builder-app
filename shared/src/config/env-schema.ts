import { z } from 'zod';

/**
 * Shared environment variable schema for the Backend.
 */
export const BackendEnvSchema = z.object({
    GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
    GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
    GEMINI_EASY_MODEL: z.string().default('gemini-2.5-flash-lite'),
    GEMINI_HARD_MODEL: z.string().default('gemini-2.5-flash'),
    GEMINI_TIMEOUT: z.coerce.number().default(60000),
    GEMINI_MAX_RETRIES: z.coerce.number().default(3),
    MAX_OUTPUT_TOKENS: z.coerce.number().default(16384),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    CORS_ORIGIN: z.string().url().or(z.string().regex(/^http:\/\/localhost/)).default('http://localhost:8080'),
});

/**
 * Shared environment variable schema for the Frontend.
 */
export const FrontendEnvSchema = z.object({
    VITE_SUPABASE_URL: z.string().url('VITE_SUPABASE_URL must be a valid URL'),
    VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1, 'VITE_SUPABASE_PUBLISHABLE_KEY is required'),
    VITE_API_BASE_URL: z.string().url().or(z.string().min(0)).default(''),
});

/**
 * Common environment variables that might be used by both.
 */
export const CommonEnvSchema = z.object({
    VITE_SUPABASE_URL: z.string().url(),
    VITE_SUPABASE_PUBLISHABLE_KEY: z.string(),
});

export type BackendEnv = z.infer<typeof BackendEnvSchema>;
export type FrontendEnv = z.infer<typeof FrontendEnvSchema>;
export type CommonEnv = z.infer<typeof CommonEnvSchema>;

/**
 * Validates the provided environment object against the schema.
 */
export function validateEnv<T extends z.ZodTypeAny>(schema: T, env: unknown): z.infer<T> {
    const result = schema.safeParse(env);
    if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        const errorMsg = Object.entries(errors)
            .map(([key, msgs]) => `${key}: ${(msgs as string[] | undefined)?.join(', ')}`)
            .join('\n');
        throw new Error(`Environment validation failed:\n${errorMsg}`);
    }
    return result.data;
}
