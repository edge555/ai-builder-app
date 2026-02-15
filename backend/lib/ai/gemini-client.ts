/**
 * Gemini API Client
 * Handles communication with Google's Gemini API for code generation and modification.
 */

import { createLogger } from '../logger';
import { config, GEMINI_TIMEOUT } from '../config';
import { GeminiCache } from './gemini-cache';
import { sanitizeUrl, truncatePayload } from './gemini-utils';
import { createParserState, parseStreamChunk, trimParserBuffer } from './gemini-json-parser';
import { extractResponseContent, validateStreamingContent } from './gemini-response-validator';
import { OperationTimer, formatMetrics } from '../metrics';
import type {
  GeminiClientConfig,
  GeminiRequest,
  GeminiStreamingRequest,
  GeminiResponse,
  GeminiAPIResponse,
} from './gemini-types';

const logger = createLogger('gemini-client');

/**
 * Client for interacting with Google's Gemini API.
 * Implements timeout and retry logic with exponential backoff.
 */
export class GeminiClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelay: number;
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  private readonly cache: GeminiCache;

  constructor(clientConfig: GeminiClientConfig) {
    if (!clientConfig.apiKey) {
      throw new Error('Gemini API key is required');
    }
    this.apiKey = clientConfig.apiKey;
    this.model = clientConfig.model ?? config.ai.model;
    this.timeout = clientConfig.timeout ?? GEMINI_TIMEOUT;
    this.maxRetries = clientConfig.maxRetries ?? config.api.maxRetries;
    this.retryBaseDelay = clientConfig.retryBaseDelay ?? config.api.retryBaseDelay;

    // Initialize cache manager
    this.cache = new GeminiCache(this.baseUrl, this.apiKey, this.model, this.timeout);
  }

  /**
   * Sends a request to the Gemini API with retry logic.
   */
  async generate(request: GeminiRequest): Promise<GeminiResponse> {
    const timer = new OperationTimer('generate', request.requestId);
    const contextLogger = request.requestId ? logger.withRequestId(request.requestId) : logger;

    let lastError: Error | null = null;
    let retryCount = 0;
    let usage: GeminiResponse['usage'] | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const { content, usage: requestUsage } = await this.makeRequest(request);
        usage = requestUsage;

        const metrics = timer.complete(true, {
          retryCount: attempt,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          totalTokens: usage?.totalTokens,
        });

        contextLogger.info('Gemini generate completed', formatMetrics(metrics));

        return {
          success: true,
          content,
          retryCount: attempt,
          usage,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount = attempt;

        // Don't retry on non-retryable errors
        if (!this.isRetryableError(lastError)) {
          break;
        }

        // Don't wait after the last attempt
        if (attempt < this.maxRetries) {
          await this.delay(this.calculateBackoff(attempt));
        }
      }
    }

    const metrics = timer.complete(false, {
      retryCount,
      error: lastError?.message ?? 'Unknown error occurred',
    });

    contextLogger.error('Gemini generate failed', formatMetrics(metrics));

    const { errorType, errorCode } = this.categorizeError(lastError!);

    return {
      success: false,
      error: lastError?.message ?? 'Unknown error occurred',
      errorType,
      errorCode,
      retryCount,
    };
  }

  /**
   * Sends a streaming request to the Gemini API.
   * Calls onChunk callback as content is received.
   */
  async generateStreaming(request: GeminiStreamingRequest): Promise<GeminiResponse> {
    const timer = new OperationTimer('generateStreaming', request.requestId);
    const contextLogger = request.requestId ? logger.withRequestId(request.requestId) : logger;

    let lastError: Error | null = null;
    let retryCount = 0;
    let usage: GeminiResponse['usage'] | undefined;
    let partialContent: string | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const { content, usage: requestUsage, partialContent: partial } = await this.makeStreamingRequest(request);
        usage = requestUsage;
        partialContent = partial;

        const metrics = timer.complete(true, {
          retryCount: attempt,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          totalTokens: usage?.totalTokens,
        });

        contextLogger.info('Gemini generateStreaming completed', formatMetrics(metrics));

        return {
          success: true,
          content,
          retryCount: attempt,
          usage,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount = attempt;

        // Capture partial content from error if available
        if (error && typeof error === 'object' && 'partialContent' in error) {
          partialContent = (error as { partialContent?: string }).partialContent;
        }

        // Don't retry on non-retryable errors
        if (!this.isRetryableError(lastError)) {
          break;
        }

        // Don't wait after the last attempt
        if (attempt < this.maxRetries) {
          await this.delay(this.calculateBackoff(attempt));
        }
      }
    }

    const metrics = timer.complete(false, {
      retryCount,
      error: lastError?.message ?? 'Unknown error occurred',
      ...(partialContent && { partialContentLength: partialContent.length }),
    });

    contextLogger.error('Gemini generateStreaming failed', formatMetrics(metrics));

    const { errorType, errorCode } = this.categorizeError(lastError!);

    return {
      success: false,
      error: lastError?.message ?? 'Unknown error occurred',
      errorType,
      errorCode,
      retryCount,
      partialContent,
    };
  }

  /**
   * Makes a streaming request to the Gemini API.
   */
  private async makeStreamingRequest(request: GeminiStreamingRequest): Promise<{ content: string; usage?: GeminiResponse['usage']; partialContent?: string }> {
    const url = `${this.baseUrl}/models/${this.model}:streamGenerateContent`;
    // Determine cached content and dynamic system instruction
    let cachedContentName: string | undefined;
    let systemInstructionText: string | undefined = request.systemInstruction;

    if (request.cacheConfig) {
      cachedContentName = await this.cache.getOrCreateCachedContent(
        request.cacheConfig.staticInstruction,
        request.cacheConfig.cacheId
      );
      systemInstructionText = request.cacheConfig.dynamicInstruction;
    }

    const body = {
      contents: [
        {
          parts: [{ text: request.prompt }],
        },
      ],
      generationConfig: {
        temperature: request.temperature ?? config.ai.temperature,
        maxOutputTokens: request.maxOutputTokens ?? config.ai.maxOutputTokens,
        ...(request.responseSchema && {
          responseMimeType: 'application/json',
          responseSchema: request.responseSchema,
        }),
      },
      ...(systemInstructionText && {
        systemInstruction: {
          parts: [{ text: systemInstructionText }],
        },
      }),
      ...(cachedContentName && {
        cachedContent: cachedContentName,
      }),
    };

    logger.debug('Gemini API streaming request', {
      url: sanitizeUrl(url),
      model: this.model,
      promptLength: request.prompt.length,
      systemInstructionLength: systemInstructionText?.length ?? 0,
    });

    // Create timeout controller
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), this.timeout);

    const signal = request.signal
      ? AbortSignal.any([request.signal, timeoutController.signal])
      : timeoutController.signal;

    let accumulated = '';
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        clearTimeout(timeoutId);
        const errorText = await response.text();
        logger.error('Gemini API error response', {
          status: response.status,
          errorText: truncatePayload(errorText),
        });
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        clearTimeout(timeoutId);
        throw new Error('No response body for streaming');
      }

      const decoder = new TextDecoder();
      const parserState = createParserState();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });
        const chunks = parseStreamChunk(chunkText, parserState);

        for (const chunk of chunks) {
          accumulated += chunk;
          request.onChunk?.(chunk, accumulated.length);
        }

        // Periodically trim the buffer to manage memory
        trimParserBuffer(parserState);
      }

      clearTimeout(timeoutId);
      validateStreamingContent(accumulated);

      logger.info('Gemini streaming request completed', {
        contentLength: accumulated.length,
      });

      // Note: Token usage is typically not available in streaming responses
      // It may be included in the final chunk, but we don't parse it currently
      return { content: accumulated, usage: undefined };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        // Check if it was a timeout or user-initiated abort
        if (timeoutController.signal.aborted && !request.signal?.aborted) {
          // Timeout - attach partial content if available
          const timeoutError = new Error(`Request timeout after ${this.timeout}ms`) as Error & { partialContent?: string };
          if (accumulated.length > 0) {
            timeoutError.partialContent = accumulated;
            logger.warn('Streaming timeout with partial content', {
              partialContentLength: accumulated.length,
            });
          }
          throw timeoutError;
        }
        // User-initiated abort
        const cancelError = new Error('Request was cancelled') as Error & { partialContent?: string };
        if (accumulated.length > 0) {
          cancelError.partialContent = accumulated;
        }
        throw cancelError;
      }

      logger.error('Gemini streaming API exception', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Makes a single request to the Gemini API.
   */
  private async makeRequest(request: GeminiRequest): Promise<{ content: string; usage?: GeminiResponse['usage'] }> {
    const url = `${this.baseUrl}/models/${this.model}:generateContent`;
    // Determine cached content and dynamic system instruction
    let cachedContentName: string | undefined;
    let systemInstructionText: string | undefined = request.systemInstruction;

    if (request.cacheConfig) {
      cachedContentName = await this.cache.getOrCreateCachedContent(
        request.cacheConfig.staticInstruction,
        request.cacheConfig.cacheId
      );
      systemInstructionText = request.cacheConfig.dynamicInstruction;
    }

    const body = {
      contents: [
        {
          parts: [{ text: request.prompt }],
        },
      ],
      generationConfig: {
        temperature: request.temperature ?? config.ai.temperature,
        maxOutputTokens: request.maxOutputTokens ?? config.ai.maxOutputTokens,
        // When responseSchema is provided, Gemini returns guaranteed valid JSON
        ...(request.responseSchema && {
          responseMimeType: 'application/json',
          responseSchema: request.responseSchema,
        }),
      },
      ...(systemInstructionText && {
        systemInstruction: {
          parts: [{ text: systemInstructionText }],
        },
      }),
      ...(cachedContentName && {
        cachedContent: cachedContentName,
      }),
    };

    logger.debug('Gemini API request', {
      url: sanitizeUrl(url),
      model: this.model,
      promptLength: request.prompt.length,
      systemInstructionLength: systemInstructionText?.length ?? 0,
      body: truncatePayload(JSON.stringify(body, null, 2)),
    });

    // Create timeout controller
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), this.timeout);

    // Combine external signal (if provided) with timeout signal
    const signal = request.signal
      ? AbortSignal.any([request.signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify(body),
        signal,
      });

      clearTimeout(timeoutId);

      logger.debug('Gemini API response received', {
        status: response.status,
        statusText: response.statusText,
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Gemini API error response', {
          status: response.status,
          errorText: truncatePayload(errorText),
        });

        let errorData: GeminiAPIResponse = {};
        try {
          errorData = JSON.parse(errorText);
          logger.debug('Parsed error data', {
            errorData: truncatePayload(JSON.stringify(errorData, null, 2)),
          });
        } catch {
          logger.debug('Could not parse error response as JSON');
        }

        const errorMessage = errorData.error?.message ?? response.statusText;
        const errorStatus = response.status;

        // Enhance error message based on status code
        if (errorStatus === 429) {
          throw new Error(`Rate limit exceeded: ${errorMessage}`);
        } else if (errorStatus === 408) {
          throw new Error(`Request timeout: ${errorMessage}`);
        } else {
          throw new Error(`Gemini API error: ${errorStatus} - ${errorMessage}`);
        }
      }

      const data = (await response.json()) as GeminiAPIResponse;
      logger.debug('Gemini API success', {
        responseStructure: truncatePayload(JSON.stringify(data, null, 2)),
      });

      const content = extractResponseContent(data);

      // Extract token usage if available
      const usage = data.usageMetadata
        ? {
          inputTokens: data.usageMetadata.promptTokenCount,
          outputTokens: data.usageMetadata.candidatesTokenCount,
          totalTokens: data.usageMetadata.totalTokenCount,
        }
        : undefined;

      logger.info('Gemini request completed successfully', {
        contentLength: content.length,
        ...(usage && { usage }),
      });

      return { content, usage };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        // Check if it was a timeout or user-initiated abort
        if (timeoutController.signal.aborted && !request.signal?.aborted) {
          throw new Error(`Request timeout after ${this.timeout}ms`);
        }
        // User-initiated abort
        throw new Error('Request was cancelled');
      }

      logger.error('Gemini API exception', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Categorizes an error into a type and code.
   */
  private categorizeError(error: Error): { errorType: GeminiResponse['errorType']; errorCode: string } {
    const message = error.message.toLowerCase();

    // Timeout errors
    if (message.includes('timeout')) {
      return { errorType: 'timeout', errorCode: 'TIMEOUT' };
    }

    // Cancelled/aborted requests
    if (message.includes('cancel') || message.includes('abort')) {
      return { errorType: 'cancelled', errorCode: 'CANCELLED' };
    }

    // Rate limit errors
    if (message.includes('rate limit') || message.includes('429') || message.includes('quota')) {
      return { errorType: 'rate_limit', errorCode: 'RATE_LIMIT_EXCEEDED' };
    }

    // API errors (4xx, 5xx)
    if (message.includes('gemini api error') || /[45]\d{2}/.test(message)) {
      return { errorType: 'api_error', errorCode: 'API_ERROR' };
    }

    // Unknown errors
    return { errorType: 'unknown', errorCode: 'INTERNAL_ERROR' };
  }

  /**
   * Determines if an error is retryable.
   */
  private isRetryableError(error: Error): boolean {
    const { errorType } = this.categorizeError(error);

    // NEVER retry on timeout or cancelled - this ensures 60s max wait
    if (errorType === 'timeout' || errorType === 'cancelled') {
      return false;
    }

    // Retry on rate limiting and server errors
    return errorType === 'rate_limit' || errorType === 'api_error';
  }


  /**
   * Calculates exponential backoff delay.
   */
  private calculateBackoff(attempt: number): number {
    // Exponential backoff with jitter
    const exponentialDelay = this.retryBaseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * exponentialDelay;
    return exponentialDelay + jitter;
  }

  /**
   * Delays execution for the specified duration.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Creates a GeminiClient instance from environment variables.
 * @param model Optional model override (e.g. 'gemini-1.5-flash')
 */
export function createGeminiClient(model?: string): GeminiClient {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  return new GeminiClient({
    apiKey,
    model: model ?? process.env.GEMINI_MODEL ?? config.ai.model,
    timeout: parseInt(process.env.GEMINI_TIMEOUT ?? String(GEMINI_TIMEOUT), 10),
    maxRetries: parseInt(process.env.GEMINI_MAX_RETRIES ?? String(config.api.maxRetries), 10),
  });
}
