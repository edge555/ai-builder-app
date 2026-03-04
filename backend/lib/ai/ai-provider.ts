/**
 * @module ai/ai-provider
 * @description Provider-agnostic AI interface contract.
 * Defines `AIRequest`, `AIStreamingRequest`, `AIResponse`, and the `AIProvider`
 * interface that all AI clients (Modal, OpenRouter) must implement.
 * This abstraction allows providers to be swapped without changing call sites.
 *
 * @requires No runtime dependencies — type definitions only.
 */

/** Provider-agnostic request type */
export interface AIRequest {
  /** The prompt to send to the AI */
  prompt: string;
  /** System instruction for the model */
  systemInstruction?: string;
  /**
   * Optional configuration for cached content.
   * Allows splitting system instructions into static (cacheable) and dynamic parts.
   */
  cacheConfig?: {
    /** Static, cacheable portion of the system instruction */
    staticInstruction: string;
    /** Dynamic, per-request portion of the system instruction */
    dynamicInstruction?: string;
    /**
     * Optional logical cache identifier.
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

/** Provider-agnostic streaming request type */
export interface AIStreamingRequest extends AIRequest {
  /** Callback for each chunk of streamed content */
  onChunk?: (chunk: string, accumulatedLength: number) => void;
}

/** Provider-agnostic response type */
export interface AIResponse {
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
  /** ID of the model that generated the response */
  modelId?: string;
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
  /** Partial content if streaming was interrupted */
  partialContent?: string;
}

/**
 * Interface that all AI providers must implement.
 */
export interface AIProvider {
  /** Send a request and return the full response */
  generate(request: AIRequest): Promise<AIResponse>;

  /** Send a streaming request, calling onChunk as content arrives */
  generateStreaming(request: AIStreamingRequest): Promise<AIResponse>;
}
