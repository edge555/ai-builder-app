import type { Logger } from '../logger';
import { OperationTimer, formatMetrics, recordOperation } from '../metrics';
import type { AIRequest, AIResponse } from './ai-provider';
import { categorizeError, isRetryableError } from './ai-error-utils';

export interface RetryConfig {
  maxRetries: number;
  retryBaseDelay: number;
  /** Provider-specific prefix for error categorization (e.g. 'openrouter request failed') */
  apiErrorPrefix: string;
  /** Optional model ID to include in the AIResponse */
  modelId?: string;
}

export type RetryOperationResult = {
  content: string;
  extraResponse?: Record<string, unknown>;
  extraLog?: Record<string, unknown>;
};

/**
 * Shared retry-with-backoff logic for AI provider clients.
 * Handles timing, logging, error categorization, and exponential backoff.
 */
export async function executeWithRetry(
  operationName: string,
  request: AIRequest,
  config: RetryConfig,
  log: Logger,
  operation: () => Promise<RetryOperationResult>
): Promise<AIResponse> {
  const timer = new OperationTimer(operationName, request.requestId);
  const contextLogger = request.requestId ? log.withRequestId(request.requestId) : log;

  let lastError: Error | null = null;
  let retryCount = 0;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const result = await operation();

      const metrics = timer.complete(true, { retryCount: attempt });
      recordOperation(metrics);
      contextLogger.info(`${operationName} completed`, {
        ...formatMetrics(metrics),
        ...(config.modelId ? { model: config.modelId } : {}),
        ...result.extraLog,
      });

      return {
        success: true,
        content: result.content,
        ...(config.modelId ? { modelId: config.modelId } : {}),
        retryCount: attempt,
        ...result.extraResponse,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      retryCount = attempt;

      if (!isRetryableError(lastError, config.apiErrorPrefix)) {
        break;
      }

      if (attempt < config.maxRetries) {
        contextLogger.warn(`${operationName} attempt ${attempt} failed, retrying...`, {
          error: lastError.message,
          ...(config.modelId ? { model: config.modelId } : {}),
        });
        await delay(calculateBackoff(attempt, config.retryBaseDelay));
      }
    }
  }

  const metrics = timer.complete(false, {
    retryCount,
    error: lastError?.message ?? 'Unknown error occurred',
  });
  recordOperation(metrics);
  contextLogger.error(`${operationName} failed`, {
    ...formatMetrics(metrics),
    ...(config.modelId ? { model: config.modelId } : {}),
  });

  const { errorType, errorCode } = categorizeError(lastError!, config.apiErrorPrefix);

  return {
    success: false,
    ...(config.modelId ? { modelId: config.modelId } : {}),
    error: lastError?.message ?? 'Unknown error occurred',
    errorType,
    errorCode,
    retryCount,
  };
}

function calculateBackoff(attempt: number, baseDelay: number): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay;
  return exponentialDelay + jitter;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
