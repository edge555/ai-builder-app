/**
 * OpenRouter AI Client
 * Communicates with OpenRouter's OpenAI-compatible API.
 * Implements the AIProvider interface for drop-in replacement.
 */

import { createLogger } from '../logger';
import { OperationTimer, formatMetrics } from '../metrics';
import type { AIProvider, AIRequest, AIStreamingRequest, AIResponse } from './ai-provider';
import { categorizeError, isRetryableError } from './ai-error-utils';
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
      throw new Error('OpenRouter API key is required');
    }
    this.apiKey = clientConfig.apiKey;
    this.model = model;
    this.timeout = clientConfig.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = clientConfig.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBaseDelay = clientConfig.retryBaseDelay ?? DEFAULT_RETRY_BASE_DELAY;
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const timer = new OperationTimer('openrouter-generate', request.requestId);
    const contextLogger = request.requestId ? logger.withRequestId(request.requestId) : logger;

    let lastError: Error | null = null;
    let retryCount = 0;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const { content, usage } = await this.makeRequest(request, false);

        const metrics = timer.complete(true, { retryCount: attempt });
        contextLogger.info('OpenRouter generate completed', {
          ...formatMetrics(metrics),
          model: this.model,
          ...(usage && { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens }),
        });

        return {
          success: true,
          content,
          retryCount: attempt,
          ...(usage && {
            usage: {
              inputTokens: usage.prompt_tokens,
              outputTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
            },
          }),
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount = attempt;

        if (!isRetryableError(lastError, 'openrouter api error')) {
          break;
        }

        if (attempt < this.maxRetries) {
          contextLogger.warn(`OpenRouter attempt ${attempt} failed, retrying...`, {
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
    contextLogger.error('OpenRouter generate failed', {
      ...formatMetrics(metrics),
      model: this.model,
    });

    const { errorType, errorCode } = categorizeError(lastError!, 'openrouter api error');

    return {
      success: false,
      error: lastError?.message ?? 'Unknown error occurred',
      errorType,
      errorCode,
      retryCount,
    };
  }

  async generateStreaming(request: AIStreamingRequest): Promise<AIResponse> {
    const timer = new OperationTimer('openrouter-generate-streaming', request.requestId);
    const contextLogger = request.requestId ? logger.withRequestId(request.requestId) : logger;

    let lastError: Error | null = null;
    let retryCount = 0;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const content = await this.makeStreamingRequest(request);

        const metrics = timer.complete(true, { retryCount: attempt });
        contextLogger.info('OpenRouter streaming completed', {
          ...formatMetrics(metrics),
          model: this.model,
        });

        return {
          success: true,
          content,
          retryCount: attempt,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount = attempt;

        if (!isRetryableError(lastError, 'openrouter api error')) {
          break;
        }

        contextLogger.warn(`OpenRouter streaming attempt ${attempt} failed, retrying...`, {
          error: lastError.message,
          model: this.model,
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
    contextLogger.error('OpenRouter streaming failed', {
      ...formatMetrics(metrics),
      model: this.model,
    });

    const { errorType, errorCode } = categorizeError(lastError!, 'openrouter api error');

    return {
      success: false,
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

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), this.timeout);

    const signal = request.signal
      ? AbortSignal.any([request.signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('OpenRouter API error response', {
          status: response.status,
          model: this.model,
          errorText: errorText.slice(0, 500),
        });
        throw new Error(`openrouter api error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as OpenRouterResponse;

      if (data.error) {
        throw new Error(`openrouter api error: ${data.error.message}`);
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('openrouter api error: empty response content');
      }

      return { content, usage: data.usage };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        if (timeoutController.signal.aborted && !request.signal?.aborted) {
          throw new Error(`Request timeout after ${this.timeout}ms`);
        }
        throw new Error('Request was cancelled');
      }

      throw error;
    }
  }

  private async makeStreamingRequest(request: AIStreamingRequest): Promise<string> {
    const body = this.buildRequestBody(request, true);

    logger.debug('OpenRouter SSE request', {
      model: this.model,
      promptLength: request.prompt.length,
    });

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), this.timeout);

    const signal = request.signal
      ? AbortSignal.any([request.signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`openrouter api error: ${response.status} - ${errorText}`);
      }

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
          if (!trimmedLine || trimmedLine.startsWith(':')) continue;

          if (trimmedLine.startsWith('data: ')) {
            const dataStr = trimmedLine.slice(6);
            if (dataStr === '[DONE]') continue;

            try {
              const chunk = JSON.parse(dataStr) as OpenRouterStreamChunk;
              const delta = chunk.choices?.[0]?.delta?.content;
              if (typeof delta === 'string') {
                accumulated += delta;
                request.onChunk?.(delta, accumulated.length);
              }
            } catch (err) {
              logger.warn('Failed to parse SSE data', { line: trimmedLine, error: err });
            }
          }
        }
      }

      clearTimeout(timeoutId);
      return accumulated;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        if (timeoutController.signal.aborted && !request.signal?.aborted) {
          throw new Error(`Request timeout after ${this.timeout}ms`);
        }
        throw new Error('Request was cancelled');
      }

      throw error;
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

  private calculateBackoff(attempt: number): number {
    const exponentialDelay = this.retryBaseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * exponentialDelay;
    return exponentialDelay + jitter;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
