/**
 * AI Configuration for Supabase Edge Functions
 * Deno-compatible configuration using environment variables.
 */

export interface AIConfig {
    apiKey: string;
    model: string;
    maxOutputTokens: number;
    temperature: number;
    timeout: number;
    maxRetries: number;
    retryBaseDelay: number;
}

/**
 * Gets the AI configuration from environment variables.
 */
export function getAIConfig(): AIConfig {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is not set');
    }

    return {
        apiKey,
        model: Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash',
        maxOutputTokens: parseInt(Deno.env.get('MAX_OUTPUT_TOKENS') || '16384', 10),
        temperature: 0.7,
        timeout: parseInt(Deno.env.get('GEMINI_TIMEOUT') || '120000', 10),
        maxRetries: parseInt(Deno.env.get('GEMINI_MAX_RETRIES') || '3', 10),
        retryBaseDelay: 1000,
    };
}
