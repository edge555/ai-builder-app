/**
 * OpenRouter API Type Definitions
 *
 * OpenRouter uses the OpenAI-compatible chat completions API format.
 * Endpoint: https://openrouter.ai/api/v1/chat/completions
 */

// ---- Request ----

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterResponseFormat {
  type: 'json_schema';
  json_schema: {
    name: string;
    strict: boolean;
    schema: object;
  };
}

export interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  response_format?: OpenRouterResponseFormat;
}

// ---- Non-streaming response ----

export interface OpenRouterUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenRouterChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string;
  };
  finish_reason: string | null;
}

export interface OpenRouterResponse {
  id: string;
  model: string;
  choices: OpenRouterChoice[];
  usage?: OpenRouterUsage;
  error?: {
    message: string;
    code?: number | string;
  };
}

// ---- SSE streaming delta ----

export interface OpenRouterStreamDelta {
  role?: 'assistant';
  content?: string;
}

export interface OpenRouterStreamChoice {
  index: number;
  delta: OpenRouterStreamDelta;
  finish_reason: string | null;
}

export interface OpenRouterStreamChunk {
  id: string;
  model: string;
  choices: OpenRouterStreamChoice[];
}

// ---- Client config ----

export interface OpenRouterClientConfig {
  apiKey: string;
  timeout?: number;
  maxRetries?: number;
  retryBaseDelay?: number;
}
