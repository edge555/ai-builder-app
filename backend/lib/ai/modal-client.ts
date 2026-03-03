/**
 * Modal AI Client
 * Communicates with a Modal-hosted model (e.g. Qwen) via a FastAPI endpoint.
 * Implements the AIProvider interface so it can be swapped in for GeminiClient.
 */

import { createLogger } from '../logger';
import { config } from '../config';
import { ERROR_TEXT_MAX_LENGTH } from '../constants';
import { OperationTimer, formatMetrics } from '../metrics';
import { extractJsonFromResponse } from './modal-response-parser';
import type { AIProvider, AIRequest, AIStreamingRequest, AIResponse } from './ai-provider';
import { categorizeError, isRetryableError } from './ai-error-utils';

const logger = createLogger('modal-client');

const DEFAULT_TIMEOUT = 660_000; // 11 minutes — must exceed Modal function timeout (10 min)
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY = 1000;

export interface ModalClientConfig {
  /** Modal FastAPI endpoint URL */
  apiUrl: string;
  /** Modal FastAPI streaming endpoint URL (SSE) */
  streamApiUrl?: string;
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
  private readonly streamApiUrl: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelay: number;
  constructor(clientConfig: ModalClientConfig) {
    if (!clientConfig.apiUrl) {
      throw new Error('Modal API URL is required');
    }
    this.apiUrl = clientConfig.apiUrl;
    this.streamApiUrl = clientConfig.streamApiUrl;
    this.apiKey = clientConfig.apiKey;
    this.timeout = clientConfig.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = clientConfig.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBaseDelay = clientConfig.retryBaseDelay ?? DEFAULT_RETRY_BASE_DELAY;
  }

  /**
   * Sends a request to the Modal endpoint with retry logic.
   */
  async generate(request: AIRequest): Promise<AIResponse> {
    return this.executeWithRetry('modal-generate', request, () => this.makeRequest(request));
  }

  /**
   * Streaming implementation: calls makeStreamingRequest() with retry logic.
   */
  async generateStreaming(request: AIStreamingRequest): Promise<AIResponse> {
    return this.executeWithRetry('modal-generate-streaming', request, () => this.makeStreamingRequest(request));
  }

  /**
   * Common retry logic for generate and generateStreaming.
   */
  private async executeWithRetry(
    operationName: string,
    request: AIRequest,
    operation: () => Promise<string>
  ): Promise<AIResponse> {
    const timer = new OperationTimer(operationName, request.requestId);
    const contextLogger = request.requestId ? logger.withRequestId(request.requestId) : logger;

    let lastError: Error | null = null;
    let retryCount = 0;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const content = await operation();

        const metrics = timer.complete(true, { retryCount: attempt });
        contextLogger.info(`${operationName} completed`, formatMetrics(metrics));

        return { success: true, content, retryCount: attempt };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount = attempt;

        if (!isRetryableError(lastError, 'modal api error')) {
          break;
        }

        contextLogger.warn(`${operationName} attempt ${attempt} failed, retrying...`, {
          error: lastError.message,
        });

        if (attempt < this.maxRetries) {
          await this.delay(this.calculateBackoff(attempt));
        }
      }
    }

    const metrics = timer.complete(false, {
      retryCount,
      error: lastError?.message ?? 'Unknown error occurred',
    });
    contextLogger.error(`${operationName} failed`, formatMetrics(metrics));

    const { errorType, errorCode } = categorizeError(lastError!, 'modal api error');

    return {
      success: false,
      error: lastError?.message ?? 'Unknown error occurred',
      errorType,
      errorCode,
      retryCount,
    };
  }

  /**
   * Makes a single request to the Modal endpoint.
   */
  private async makeRequest(request: AIRequest): Promise<string> {
    const body = this.buildRequestBody(request);

    logger.debug('Modal API request', {
      url: this.apiUrl,
      promptLength: body.prompt.length,
    });

    const { response, timeoutId } = await this.fetchWithTimeout(
      this.apiUrl,
      this.buildHeaders(),
      body,
      request.signal
    );

    try {
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Modal API error response', {
          status: response.status,
          errorText: errorText.slice(0, ERROR_TEXT_MAX_LENGTH),
        });
        throw new Error(`Modal API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as { content?: string;[key: string]: unknown };
      const rawContent = typeof data.content === 'string' ? data.content : JSON.stringify(data);

      logger.debug('Modal API response received', { contentLength: rawContent.length });

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
      throw this.handleFetchError(error, request.signal);
    }
  }

  /**
   * Makes a streaming request to the Modal SSE endpoint.
   * Returns the full accumulated response content.
   */
  private async makeStreamingRequest(request: AIStreamingRequest): Promise<string> {
    const url = this.streamApiUrl ?? (this.apiUrl.endsWith('/stream') ? this.apiUrl : `${this.apiUrl}/stream`);
    const body = this.buildRequestBody(request);

    logger.debug('Modal SSE request', { url, promptLength: body.prompt.length });

    const headers = this.buildHeaders({ 'Accept': 'text/event-stream' });
    const { response, timeoutId } = await this.fetchWithTimeout(url, headers, body, request.signal);

    try {
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Modal API error: ${response.status} - ${errorText}`);
      }

      const accumulated = await this.processSSEStream(response, (token, totalLength) => {
        request.onChunk?.(token, totalLength);
      });

      clearTimeout(timeoutId);
      return accumulated;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Build the request body for Modal API calls.
   */
  private buildRequestBody(request: AIRequest): { prompt: string; system_instruction: string; temperature: number; max_tokens: number; response_format: string } {
    return {
      prompt: this.formatPrompt(request),
      system_instruction: this.getSystemInstruction(request) ?? '',
      temperature: request.temperature ?? config.ai.temperature,
      max_tokens: request.maxOutputTokens ?? config.ai.maxOutputTokens,
      response_format: request.responseSchema ? 'json_object' : 'text',
    };
  }

  /**
   * Build request headers, optionally merging additional headers.
   */
  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  /**
   * Execute a fetch with timeout and optional abort signal.
   */
  private async fetchWithTimeout(
    url: string,
    headers: Record<string, string>,
    body: object,
    requestSignal?: AbortSignal
  ): Promise<{ response: Response; timeoutId: ReturnType<typeof setTimeout> }> {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), this.timeout);

    const signal = requestSignal
      ? AbortSignal.any([requestSignal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });
      return { response, timeoutId };
    } catch (error) {
      clearTimeout(timeoutId);
      throw this.handleFetchError(error, requestSignal);
    }
  }

  /**
   * Process an SSE stream, calling onToken for each received token.
   * Returns the full accumulated content.
   */
  private async processSSEStream(
    response: Response,
    onToken: (token: string, totalLength: number) => void
  ): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is null');
    }

    const decoder = new TextDecoder();
    let accumulated = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

        const dataStr = trimmedLine.slice(6);
        if (dataStr === '[DONE]') continue;

        try {
          const data = JSON.parse(dataStr);
          const token = data.token;
          if (typeof token === 'string') {
            accumulated += token;
            onToken(token, accumulated.length);
          }
        } catch (err) {
          logger.warn('Failed to parse SSE data', { line: trimmedLine, error: err });
        }
      }
    }

    return accumulated;
  }

  /**
   * Handle fetch errors, converting AbortErrors to descriptive messages.
   */
  private handleFetchError(error: unknown, requestSignal?: AbortSignal): Error {
    if (error instanceof Error && error.name === 'AbortError') {
      if (!requestSignal?.aborted) {
        return new Error(`Request timeout after ${this.timeout}ms`);
      }
      return new Error('Request was cancelled');
    }

    logger.error('Modal API exception', {
      error: error instanceof Error ? error.message : String(error),
    });
    return error instanceof Error ? error : new Error(String(error));
  }

  /**
   * Builds the user-turn prompt content.
   * System instruction is always sent as a separate field — never folded in here.
   * When responseSchema is present, appends a JSON schema hint to the user prompt
   * so the model knows the expected output format.
   */
  private formatPrompt(request: AIRequest): string {
    if (request.responseSchema) {
      // Only user prompt + JSON schema hint — system instruction is handled separately in getSystemInstruction
      return (
        request.prompt +
        '\n\nYou MUST respond with valid JSON only. Schema: ' +
        JSON.stringify(request.responseSchema)
      );
    }
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
   * Calculates exponential backoff delay with jitter.
   */
  private calculateBackoff(attempt: number): number {
    // Exponential backoff: doubles the delay with each retry attempt (2^attempt)
    const exponentialDelay = this.retryBaseDelay * Math.pow(2, attempt);
    // Add up to 30% random jitter (0.3) to prevent thundering herd problem
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
    streamApiUrl: process.env.MODAL_STREAM_API_URL,
    apiKey: process.env.MODAL_API_KEY,
    timeout: process.env.MODAL_TIMEOUT
      ? parseInt(process.env.MODAL_TIMEOUT, 10)
      : undefined,
    model,
  });
}
