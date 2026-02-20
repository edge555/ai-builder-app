/**
 * Modal AI Client
 * Communicates with a Modal-hosted model (e.g. Qwen) via a FastAPI endpoint.
 * Implements the AIProvider interface so it can be swapped in for GeminiClient.
 */

import { createLogger } from '../logger';
import { config } from '../config';
import { OperationTimer, formatMetrics } from '../metrics';
import { extractJsonFromResponse } from './modal-response-parser';
import type { AIProvider, AIRequest, AIStreamingRequest, AIResponse } from './ai-provider';

const logger = createLogger('modal-client');

const DEFAULT_TIMEOUT = 120_000; // 2 minutes — Modal models can be slower
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY = 1000;

export interface ModalClientConfig {
  /** Modal FastAPI endpoint URL */
  apiUrl: string;
  /** Optional API key for authentication */
  apiKey?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms */
  retryBaseDelay?: number;
  /** Model identifier (for future multi-model support) */
  model?: string;
}

/**
 * Client for interacting with a Modal-hosted AI model.
 * Non-streaming: POSTs to the endpoint and returns the full response.
 * generateStreaming() delegates to generate() and emits all content at once via onChunk.
 */
export class ModalClient implements AIProvider {
  private readonly apiUrl: string;
  private readonly apiKey: string | undefined;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelay: number;
  private readonly model: string | undefined;

  constructor(clientConfig: ModalClientConfig) {
    if (!clientConfig.apiUrl) {
      throw new Error('Modal API URL is required');
    }
    this.apiUrl = clientConfig.apiUrl;
    this.apiKey = clientConfig.apiKey;
    this.timeout = clientConfig.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = clientConfig.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBaseDelay = clientConfig.retryBaseDelay ?? DEFAULT_RETRY_BASE_DELAY;
    this.model = clientConfig.model;
  }

  /**
   * Sends a request to the Modal endpoint with retry logic.
   */
  async generate(request: AIRequest): Promise<AIResponse> {
    const timer = new OperationTimer('modal-generate', request.requestId);
    const contextLogger = request.requestId ? logger.withRequestId(request.requestId) : logger;

    let lastError: Error | null = null;
    let retryCount = 0;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const content = await this.makeRequest(request);

        const metrics = timer.complete(true, { retryCount: attempt });
        contextLogger.info('Modal generate completed', formatMetrics(metrics));

        return {
          success: true,
          content,
          retryCount: attempt,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount = attempt;

        if (!this.isRetryableError(lastError)) {
          break;
        }

        if (attempt < this.maxRetries) {
          await this.delay(this.calculateBackoff(attempt));
        }
      }
    }

    const metrics = timer.complete(false, {
      retryCount,
      error: lastError?.message ?? 'Unknown error occurred',
    });
    contextLogger.error('Modal generate failed', formatMetrics(metrics));

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
   * Streaming implementation: calls generate() internally, then emits the full
   * content via onChunk in a single call (Modal doesn't support streaming natively).
   */
  async generateStreaming(request: AIStreamingRequest): Promise<AIResponse> {
    const result = await this.generate(request);

    // Emit the full content as a single chunk if successful
    if (result.success && result.content) {
      request.onChunk?.(result.content, result.content.length);
    }

    return result;
  }

  /**
   * Makes a single request to the Modal endpoint.
   */
  private async makeRequest(request: AIRequest): Promise<string> {
    const prompt = this.formatPrompt(request);

    const body = {
      prompt,
      system_instruction: undefined as string | undefined,
      temperature: request.temperature ?? config.ai.temperature,
      max_tokens: request.maxOutputTokens ?? config.ai.maxOutputTokens,
      ...(this.model && { model: this.model }),
    };

    // If we didn't fold system instruction into prompt (no responseSchema),
    // send it as a separate field
    if (!request.responseSchema) {
      body.system_instruction = this.getSystemInstruction(request);
    }

    logger.debug('Modal API request', {
      url: this.apiUrl,
      promptLength: prompt.length,
      model: this.model,
    });

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), this.timeout);

    const signal = request.signal
      ? AbortSignal.any([request.signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Modal API error response', {
          status: response.status,
          errorText: errorText.slice(0, 500),
        });
        throw new Error(`Modal API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as { content?: string; [key: string]: unknown };
      const rawContent = typeof data.content === 'string' ? data.content : JSON.stringify(data);

      logger.debug('Modal API response received', {
        contentLength: rawContent.length,
      });

      // If a responseSchema was requested, we need to extract valid JSON
      // since Modal can't enforce structured output like Gemini
      if (request.responseSchema) {
        const extracted = extractJsonFromResponse(rawContent);
        if (!extracted) {
          throw new Error('Failed to extract valid JSON from Modal response');
        }
        return extracted;
      }

      return rawContent;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        if (timeoutController.signal.aborted && !request.signal?.aborted) {
          throw new Error(`Request timeout after ${this.timeout}ms`);
        }
        throw new Error('Request was cancelled');
      }

      logger.error('Modal API exception', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Combines system instruction, cache config parts, and user prompt.
   * When responseSchema is present, adds a JSON instruction since Modal
   * can't enforce structured output natively.
   */
  private formatPrompt(request: AIRequest): string {
    const parts: string[] = [];

    // When responseSchema is present, fold everything into the prompt
    // with an explicit JSON instruction
    if (request.responseSchema) {
      const systemInstruction = this.getSystemInstruction(request);
      if (systemInstruction) {
        parts.push(systemInstruction);
      }

      parts.push(request.prompt);
      parts.push(
        '\n\nIMPORTANT: You MUST respond with valid JSON only, no markdown or explanation. ' +
        'Your response must conform to this JSON schema:\n' +
        JSON.stringify(request.responseSchema, null, 2)
      );

      return parts.join('\n\n');
    }

    // No responseSchema — just return the user prompt
    // (system instruction sent as separate field)
    return request.prompt;
  }

  /**
   * Extracts the system instruction from the request, combining
   * cacheConfig parts if present.
   */
  private getSystemInstruction(request: AIRequest): string | undefined {
    if (request.cacheConfig) {
      const parts: string[] = [];
      if (request.cacheConfig.staticInstruction) {
        parts.push(request.cacheConfig.staticInstruction);
      }
      if (request.cacheConfig.dynamicInstruction) {
        parts.push(request.cacheConfig.dynamicInstruction);
      }
      return parts.length > 0 ? parts.join('\n\n') : undefined;
    }
    return request.systemInstruction;
  }

  /**
   * Categorizes an error into a type and code.
   * Reuses the same pattern as GeminiClient.
   */
  private categorizeError(error: Error): { errorType: AIResponse['errorType']; errorCode: string } {
    const message = error.message.toLowerCase();

    if (message.includes('timeout')) {
      return { errorType: 'timeout', errorCode: 'TIMEOUT' };
    }
    if (message.includes('cancel') || message.includes('abort')) {
      return { errorType: 'cancelled', errorCode: 'CANCELLED' };
    }
    if (message.includes('rate limit') || message.includes('429') || message.includes('quota')) {
      return { errorType: 'rate_limit', errorCode: 'RATE_LIMIT_EXCEEDED' };
    }
    if (message.includes('modal api error') || /[45]\d{2}/.test(message)) {
      return { errorType: 'api_error', errorCode: 'API_ERROR' };
    }
    return { errorType: 'unknown', errorCode: 'INTERNAL_ERROR' };
  }

  /**
   * Determines if an error is retryable.
   */
  private isRetryableError(error: Error): boolean {
    const { errorType } = this.categorizeError(error);
    if (errorType === 'timeout' || errorType === 'cancelled') {
      return false;
    }
    return errorType === 'rate_limit' || errorType === 'api_error';
  }

  /**
   * Calculates exponential backoff delay with jitter.
   */
  private calculateBackoff(attempt: number): number {
    const exponentialDelay = this.retryBaseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * exponentialDelay;
    return exponentialDelay + jitter;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Creates a ModalClient instance from environment variables.
 */
export function createModalClient(model?: string): ModalClient {
  const apiUrl = process.env.MODAL_API_URL;
  if (!apiUrl) {
    throw new Error('MODAL_API_URL environment variable is not set');
  }

  return new ModalClient({
    apiUrl,
    apiKey: process.env.MODAL_API_KEY,
    timeout: process.env.MODAL_TIMEOUT
      ? parseInt(process.env.MODAL_TIMEOUT, 10)
      : undefined,
    model,
  });
}
