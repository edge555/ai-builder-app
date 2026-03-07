/**
 * @module ai/modal-client
 * @description AI client for Modal-hosted models (e.g. Qwen via FastAPI endpoint).
 * Implements the `AIProvider` interface with retry/backoff logic and SSE streaming.
 * `generateStreaming` delegates to the `/stream` SSE endpoint and emits tokens
 * via the `onChunk` callback.
 *
 * @requires ./ai-provider - AIProvider interface
 * @requires ./ai-error-utils - Error categorization and retry helpers
 * @requires ./modal-response-parser - JSON extraction from raw Modal responses
 * @requires ../logger - Structured logging
 * @requires ../metrics - Operation timing
 * @requires ../config - AI generation settings
 * @requires ../constants - ERROR_TEXT_MAX_LENGTH
 * @requires @ai-app-builder/shared/utils - Error message constructors
 */

import { createLogger } from '../logger';
import { config } from '../config';
import { ERROR_TEXT_MAX_LENGTH } from '../constants';
import { extractJsonFromResponse } from './modal-response-parser';
import type { AIProvider, AIRequest, AIStreamingRequest, AIResponse } from './ai-provider';
import { executeWithRetry } from './ai-retry';
import { processSSEStream } from './sse-stream-processor';
import { serviceError, envVarError } from '@ai-app-builder/shared/utils';

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
      throw new Error(envVarError('Modal API URL', 'a valid Modal FastAPI endpoint URL'));
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
    return executeWithRetry(
      'modal-generate',
      request,
      { maxRetries: this.maxRetries, retryBaseDelay: this.retryBaseDelay, apiErrorPrefix: 'modal request failed' },
      logger,
      async () => ({ content: await this.makeRequest(request) })
    );
  }

  /**
   * Streaming implementation: calls makeStreamingRequest() with retry logic.
   */
  async generateStreaming(request: AIStreamingRequest): Promise<AIResponse> {
    return executeWithRetry(
      'modal-generate-streaming',
      request,
      { maxRetries: this.maxRetries, retryBaseDelay: this.retryBaseDelay, apiErrorPrefix: 'modal request failed' },
      logger,
      async () => ({ content: await this.makeStreamingRequest(request) })
    );
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
        throw new Error(serviceError('Modal', `${response.status} - ${errorText}`));
      }

      const data = await response.json() as { content?: string;[key: string]: unknown };
      const rawContent = typeof data.content === 'string' ? data.content : JSON.stringify(data);

      logger.debug('Modal API response received', { contentLength: rawContent.length });

      if (request.responseSchema) {
        const extracted = extractJsonFromResponse(rawContent);
        if (!extracted) {
          throw new Error(serviceError('Modal', 'failed to extract valid JSON from response'));
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
        throw new Error(serviceError('Modal', `${response.status} - ${errorText}`));
      }

      const accumulated = await processSSEStream(response, this.parseSSEToken.bind(this), (token, totalLength) => {
        request.onChunk?.(token, totalLength);
      }, 'Modal');

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
   * Parse a single SSE line and extract the token string, or null if not applicable.
   */
  private parseSSEToken(line: string): string | null {
    const trimmedLine = line.trim();
    if (!trimmedLine || !trimmedLine.startsWith('data: ')) return null;

    const dataStr = trimmedLine.slice(6);
    if (dataStr === '[DONE]') return null;

    try {
      const data = JSON.parse(dataStr);
      const token = data.token;
      return typeof token === 'string' ? token : null;
    } catch (error) {
      logger.warn('Failed to parse SSE data', { line: trimmedLine, error });
      return null;
    }
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

}

/**
 * Creates a ModalClient instance from environment variables.
 */
export function createModalClient(model?: string): ModalClient {
  const apiUrl = process.env.MODAL_API_URL;
  if (!apiUrl) {
    throw new Error(envVarError('MODAL_API_URL', 'required for Modal provider'));
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
