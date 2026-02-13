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
    /** Optional abort signal for request cancellation */
    signal?: AbortSignal;
    /** Optional request ID for correlation and tracking */
    requestId?: string;
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
    /** Error code for programmatic handling */
    errorCode?: string;
    /** Error type categorization */
    errorType?: 'timeout' | 'rate_limit' | 'api_error' | 'cancelled' | 'unknown';
    /** Number of retry attempts made */
    retryCount?: number;
    /** Token usage information */
    usage?: {
        /** Number of input tokens */
        inputTokens?: number;
        /** Number of output tokens */
        outputTokens?: number;
        /** Total tokens used */
        totalTokens?: number;
    };
    /** Partial content if streaming was interrupted (e.g., by timeout) */
    partialContent?: string;
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
    usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
    };
    error?: {
        message: string;
        code: number;
    };
}
