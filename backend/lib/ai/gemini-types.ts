/**
 * Gemini API Type Definitions
 * Contains all interfaces and types for the Gemini client.
 */

export interface GeminiClientConfig {
    /** Gemini API key */
    apiKey: string;
    /** Model to use (default: gemini-pro) */
    model?: string;
    /** Request timeout in milliseconds (default: 60000) */
    timeout?: number;
    /** Maximum retry attempts (default: 3) */
    maxRetries?: number;
    /** Base delay for exponential backoff in ms (default: 1000) */
    retryBaseDelay?: number;
}

export interface GeminiRequest {
    /** The prompt to send to Gemini */
    prompt: string;
    /** System instruction for the model */
    systemInstruction?: string;
    /**
     * Optional configuration for Gemini cached content.
     * Allows splitting system instructions into static (cacheable) and dynamic parts.
     */
    cacheConfig?: {
        /** Static, cacheable portion of the system instruction */
        staticInstruction: string;
        /** Dynamic, per-request portion of the system instruction */
        dynamicInstruction?: string;
        /**
         * Optional logical cache identifier.
         * When provided, it is combined with the staticInstruction hash and model
         * to form the cache key. When omitted, only the hash + model are used.
         */
        cacheId?: string;
    };
    /** Temperature for response generation (0-1) */
    temperature?: number;
    /** Maximum tokens in response */
    maxOutputTokens?: number;
    /** JSON schema for structured output */
    responseSchema?: object;
}

export interface GeminiStreamingRequest extends GeminiRequest {
    /** Callback for each chunk of streamed content */
    onChunk?: (chunk: string, accumulatedLength: number) => void;
}

export interface GeminiResponse {
    /** Whether the request was successful */
    success: boolean;
    /** The generated text content */
    content?: string;
    /** Error message if unsuccessful */
    error?: string;
    /** Number of retry attempts made */
    retryCount?: number;
}

export interface GeminiAPIResponse {
    candidates?: Array<{
        content?: {
            parts?: Array<{
                text?: string;
            }>;
        };
        finishReason?: string;
    }>;
    error?: {
        message: string;
        code: number;
    };
}
