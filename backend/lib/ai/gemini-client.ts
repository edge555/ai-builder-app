/**
 * Gemini API Client
 * Handles communication with Google's Gemini API for code generation and modification.
 */

import { createLogger } from '../logger';
import { config, GEMINI_TIMEOUT } from '../config';
import { GeminiCache } from './gemini-cache';
import { sanitizeUrl, truncatePayload } from './gemini-utils';
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
    let lastError: Error | null = null;
    let retryCount = 0;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.makeRequest(request);
        return {
          success: true,
          content: response,
          retryCount: attempt,
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

    return {
      success: false,
      error: lastError?.message ?? 'Unknown error occurred',
      retryCount,
    };
  }

  /**
   * Sends a streaming request to the Gemini API.
   * Calls onChunk callback as content is received.
   */
  async generateStreaming(request: GeminiStreamingRequest): Promise<GeminiResponse> {
    let lastError: Error | null = null;
    let retryCount = 0;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.makeStreamingRequest(request);
        return {
          success: true,
          content: response,
          retryCount: attempt,
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

    return {
      success: false,
      error: lastError?.message ?? 'Unknown error occurred',
      retryCount,
    };
  }

  /**
   * Makes a streaming request to the Gemini API.
   */
  private async makeStreamingRequest(request: GeminiStreamingRequest): Promise<string> {
    const url = `${this.baseUrl}/models/${this.model}:streamGenerateContent?key=${this.apiKey}`;
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

    // Combine external signal (if provided) with timeout signal
    const signal = request.signal
      ? AbortSignal.any([request.signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
      let accumulated = '';
      let buffer = '';
      let braceCount = 0;
      let inString = false;
      let escapeNext = false;
      let objectStart = -1;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });
        buffer += chunkText;

        for (let i = buffer.length - chunkText.length; i < buffer.length; i++) {
          const char = buffer[i];

          if (escapeNext) {
            escapeNext = false;
            continue;
          }

          if (char === '\\') {
            escapeNext = true;
            continue;
          }

          if (char === '"') {
            inString = !inString;
            continue;
          }

          if (!inString) {
            if (char === '{') {
              if (braceCount === 0) {
                objectStart = i;
              }
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0 && objectStart !== -1) {
                // We found a complete JSON object
                const objectText = buffer.substring(objectStart, i + 1);

                try {
                  const data = JSON.parse(objectText) as GeminiAPIResponse;
                  const chunk = data.candidates?.[0]?.content?.parts?.[0]?.text;

                  if (chunk) {
                    accumulated += chunk;
                    request.onChunk?.(chunk, accumulated.length);
                  }
                } catch (e) {
                  // This captures partial or malformed objects which can happen at the very start/end
                  logger.debug('Skipping non-candidate JSON object in stream', {
                    error: e instanceof Error ? e.message : String(e),
                    text: truncatePayload(objectText)
                  });
                }

                objectStart = -1;
              }
            }
          }
        }

        // Periodically trim the buffer to keep it manageable
        // Only trim when we are between objects to avoid cutting an object in half
        if (objectStart === -1 && buffer.length > 5000 && braceCount === 0) {
          buffer = '';
        } else if (objectStart > 2000) {
          // If we've started an object but have a lot of garbage before it
          buffer = buffer.substring(objectStart);
          objectStart = 0;
        }
      }

      clearTimeout(timeoutId);

      if (!accumulated) {
        throw new Error('No content in streaming response');
      }

      logger.info('Gemini streaming request completed', {
        contentLength: accumulated.length,
      });

      return accumulated;
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

      logger.error('Gemini streaming API exception', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Makes a single request to the Gemini API.
   */
  private async makeRequest(request: GeminiRequest): Promise<string> {
    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
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
        throw new Error(
          `Gemini API error: ${response.status} - ${errorMessage}`
        );
      }

      const data = (await response.json()) as GeminiAPIResponse;
      logger.debug('Gemini API success', {
        responseStructure: truncatePayload(JSON.stringify(data, null, 2)),
      });

      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!content) {
        logger.error('No content found in Gemini response', {
          response: truncatePayload(JSON.stringify(data, null, 2)),
        });
        throw new Error('No content in Gemini response');
      }

      logger.info('Gemini request completed successfully', {
        contentLength: content.length,
      });
      return content;
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
   * Determines if an error is retryable.
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();

    // NEVER retry on timeout - this ensures 60s max wait
    if (message.includes('timeout')) {
      return false;
    }

    // Retry on rate limiting and server errors
    return (
      message.includes('rate limit') ||
      message.includes('429') ||
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504')
    );
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
