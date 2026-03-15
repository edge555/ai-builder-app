/**
 * @module ai/openrouter-client
 * @description AI client for OpenRouter's OpenAI-compatible chat completions API.
 * Implements the `AIProvider` interface with retry/backoff logic and SSE streaming.
 * Supports structured output via `json_schema` response format.
 *
 * @requires ./ai-provider - AIProvider interface
 * @requires ./ai-error-utils - Error categorization and retry helpers
 * @requires ./openrouter-types - OpenRouter request/response type definitions
 * @requires ../logger - Structured logging
 * @requires ../metrics - Operation timing
 * @requires ../constants - ERROR_TEXT_MAX_LENGTH
 * @requires @ai-app-builder/shared/utils - Error message constructors
 */

import { createLogger } from '../logger';
import { ERROR_TEXT_MAX_LENGTH } from '../constants';
import type { AIProvider, AIRequest, AIStreamingRequest, AIResponse } from './ai-provider';
import { executeWithRetry } from './ai-retry';
import { processSSEStream } from './sse-stream-processor';
import { serviceError, envVarError } from '@ai-app-builder/shared/utils';
import type {
  OpenRouterClientConfig,
  OpenRouterRequest,
  OpenRouterMessage,
  OpenRouterResponse,
  OpenRouterStreamChunk,
} from './openrouter-types';

const logger = createLogger('openrouter-client');

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_TIMEOUT = 300_000; // 5 minutes
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY = 1000;

export class OpenRouterClient implements AIProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelay: number;

  constructor(model: string, clientConfig: OpenRouterClientConfig) {
    if (!clientConfig.apiKey) {
      throw new Error(envVarError('OpenRouter API key', 'required for OpenRouter provider'));
    }
    this.apiKey = clientConfig.apiKey;
    this.model = model;
    this.timeout = clientConfig.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = clientConfig.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBaseDelay = clientConfig.retryBaseDelay ?? DEFAULT_RETRY_BASE_DELAY;
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    return executeWithRetry(
      'openrouter-generate',
      request,
      { maxRetries: this.maxRetries, retryBaseDelay: this.retryBaseDelay, apiErrorPrefix: 'openrouter request failed', modelId: this.model },
      logger,
      async () => {
        const { content, usage } = await this.makeRequest(request, false);
        return {
          content,
          extraResponse: usage ? {
            usage: {
              inputTokens: usage.prompt_tokens,
              outputTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
            },
          } : undefined,
          extraLog: usage ? { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens } : undefined,
        };
      }
    );
  }

  async generateStreaming(request: AIStreamingRequest): Promise<AIResponse> {
    return executeWithRetry(
      'openrouter-generate-streaming',
      request,
      { maxRetries: this.maxRetries, retryBaseDelay: this.retryBaseDelay, apiErrorPrefix: 'openrouter request failed', modelId: this.model },
      logger,
      async () => {
        const content = await this.makeStreamingRequest(request);
        return { content };
      }
    );
  }

  // ---- Private helpers ----

  private buildMessages(request: AIRequest): OpenRouterMessage[] {
    const messages: OpenRouterMessage[] = [];

    // System instruction
    const systemInstruction = this.getSystemInstruction(request);
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }

    // User prompt — append JSON schema hint when responseSchema is provided
    let userContent = request.prompt;
    if (request.responseSchema) {
      userContent +=
        '\n\nYou MUST respond with valid JSON only. Schema: ' +
        JSON.stringify(request.responseSchema);
    }
    messages.push({ role: 'user', content: userContent });

    return messages;
  }

  private buildRequestBody(request: AIRequest, stream: boolean): OpenRouterRequest {
    const body: OpenRouterRequest = {
      model: this.model,
      messages: this.buildMessages(request),
      stream,
    };

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }
    if (request.maxOutputTokens !== undefined) {
      body.max_tokens = request.maxOutputTokens;
    }

    // Structured output via json_schema response_format
    if (request.responseSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'response',
          strict: true,
          schema: request.responseSchema,
        },
      };
    }

    return body;
  }

  private async makeRequest(
    request: AIRequest,
    _stream: false
  ): Promise<{ content: string; usage?: OpenRouterResponse['usage'] }> {
    const body = this.buildRequestBody(request, false);

    logger.debug('OpenRouter API request', {
      model: this.model,
      promptLength: request.prompt.length,
    });

    const { response, timeoutId } = await this.fetchWithTimeout(body, {}, request.signal);

    try {
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('OpenRouter API error response', {
          status: response.status,
          model: this.model,
          errorText: errorText.slice(0, ERROR_TEXT_MAX_LENGTH),
        });
        throw new Error(serviceError('OpenRouter', `HTTP ${response.status}`));
      }

      const data = (await response.json()) as OpenRouterResponse;

      if (data.error) {
        throw new Error(serviceError('OpenRouter', data.error.message));
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(serviceError('OpenRouter', 'empty response content'));
      }

      return { content, usage: data.usage };
    } catch (error) {
      clearTimeout(timeoutId);
      throw this.handleFetchError(error, request.signal);
    }
  }

  private async makeStreamingRequest(request: AIStreamingRequest): Promise<string> {
    const body = this.buildRequestBody(request, true);

    logger.debug('OpenRouter SSE request', {
      model: this.model,
      promptLength: request.prompt.length,
    });

    const { response, timeoutId } = await this.fetchWithTimeout(
      body, { 'Accept': 'text/event-stream' }, request.signal
    );

    try {
      if (!response.ok) {
        const errorText = await response.text();
        logger.error('OpenRouter streaming error', {
          status: response.status,
          errorText: errorText.slice(0, ERROR_TEXT_MAX_LENGTH),
        });
        throw new Error(serviceError('OpenRouter', `HTTP ${response.status}`));
      }

      const accumulated = await processSSEStream(response, this.parseSSEDelta.bind(this), (delta, totalLength) => {
        request.onChunk?.(delta, totalLength);
      }, 'OpenRouter');

      clearTimeout(timeoutId);
      return accumulated;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Parse a single SSE line and extract the content delta, or null if not applicable.
   */
  private parseSSEDelta(line: string): string | null {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith(':')) return null;
    if (!trimmedLine.startsWith('data: ')) return null;

    const dataStr = trimmedLine.slice(6);
    if (dataStr === '[DONE]') return null;

    try {
      const chunk = JSON.parse(dataStr) as OpenRouterStreamChunk;
      const delta = chunk.choices?.[0]?.delta?.content;
      return typeof delta === 'string' ? delta : null;
    } catch (error) {
      logger.warn('Failed to parse SSE data', { line: trimmedLine, error });
      return null;
    }
  }

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
   * Execute a fetch with timeout and optional abort signal.
   */
  private async fetchWithTimeout(
    body: OpenRouterRequest,
    extraHeaders: Record<string, string>,
    requestSignal?: AbortSignal
  ): Promise<{ response: Response; timeoutId: ReturnType<typeof setTimeout> }> {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), this.timeout);

    const signal = requestSignal
      ? AbortSignal.any([requestSignal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          ...extraHeaders,
        },
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
   * Handle fetch errors, converting AbortErrors to descriptive messages.
   */
  private handleFetchError(error: unknown, requestSignal?: AbortSignal): Error {
    if (error instanceof Error && error.name === 'AbortError') {
      if (!requestSignal?.aborted) {
        return new Error(`Request timeout after ${this.timeout}ms`);
      }
      return new Error('Request was cancelled');
    }
    return error instanceof Error ? error : new Error(String(error));
  }

}
