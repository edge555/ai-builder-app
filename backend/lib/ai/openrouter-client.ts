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
import { OperationTimer, formatMetrics } from '../metrics';
import type { AIProvider, AIRequest, AIStreamingRequest, AIResponse } from './ai-provider';
import { categorizeError, isRetryableError } from './ai-error-utils';
import { serviceError, stateError, envVarError } from '@ai-app-builder/shared/utils';
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
    return this.executeWithRetry('openrouter-generate', request, async () => {
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
    });
  }

  async generateStreaming(request: AIStreamingRequest): Promise<AIResponse> {
    return this.executeWithRetry('openrouter-generate-streaming', request, async () => {
      const content = await this.makeStreamingRequest(request);
      return { content };
    });
  }

  /**
   * Common retry logic for generate and generateStreaming.
   */
  private async executeWithRetry(
    operationName: string,
    request: AIRequest,
    operation: () => Promise<{ content: string; extraResponse?: Record<string, unknown>; extraLog?: Record<string, unknown> }>
  ): Promise<AIResponse> {
    const timer = new OperationTimer(operationName, request.requestId);
    const contextLogger = request.requestId ? logger.withRequestId(request.requestId) : logger;

    let lastError: Error | null = null;
    let retryCount = 0;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await operation();

        const metrics = timer.complete(true, { retryCount: attempt });
        contextLogger.info(`[openrouter-client] ${operationName} to ${this.model} | Latency: ${metrics.durationMs}ms`, {
          ...formatMetrics(metrics),
          model: this.model,
          ...result.extraLog,
        });

        return {
          success: true,
          content: result.content,
          modelId: this.model,
          retryCount: attempt,
          ...result.extraResponse,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount = attempt;

        if (!isRetryableError(lastError, 'openrouter request failed')) {
          break;
        }

        if (attempt < this.maxRetries) {
          contextLogger.warn(`OpenRouter ${operationName} attempt ${attempt} failed, retrying...`, {
            error: lastError.message,
            model: this.model,
          });
          await this.delay(this.calculateBackoff(attempt));
        }
      }
    }

    const metrics = timer.complete(false, {
      retryCount,
      error: lastError?.message ?? 'Unknown error occurred',
    });
    contextLogger.error(`OpenRouter ${operationName} failed`, {
      ...formatMetrics(metrics),
      model: this.model,
    });

    const { errorType, errorCode } = categorizeError(lastError!, 'openrouter request failed');

    return {
      success: false,
      modelId: this.model,
      error: lastError?.message ?? 'Unknown error occurred',
      errorType,
      errorCode,
      retryCount,
    };
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
        throw new Error(serviceError('OpenRouter', `${response.status} - ${errorText}`));
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
        throw new Error(serviceError('OpenRouter', `${response.status} - ${errorText}`));
      }

      const accumulated = await this.processSSEStream(response, (delta, totalLength) => {
        request.onChunk?.(delta, totalLength);
      });

      clearTimeout(timeoutId);
      return accumulated;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Process an SSE stream, calling onToken for each received delta.
   */
  private async processSSEStream(
    response: Response,
    onToken: (delta: string, totalLength: number) => void
  ): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error(stateError('OpenRouter', 'response body is null'));
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
        const delta = this.parseSSEDelta(line);
        if (delta !== null) {
          accumulated += delta;
          onToken(delta, accumulated.length);
        }
      }
    }

    return accumulated;
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

  private calculateBackoff(attempt: number): number {
    const exponentialDelay = this.retryBaseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * exponentialDelay;
    return exponentialDelay + jitter;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
