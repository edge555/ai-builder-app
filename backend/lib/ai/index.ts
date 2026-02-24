/**
 * AI Module Barrel Export
 * Re-exports all public symbols from the AI module.
 */

// Core provider interface
export type { AIProvider, AIRequest, AIStreamingRequest, AIResponse } from './ai-provider';

// Modal provider (kept for modal mode)
export { ModalClient, createModalClient } from './modal-client';

// OpenRouter provider
export { OpenRouterClient } from './openrouter-client';
export type {
  OpenRouterClientConfig,
  OpenRouterRequest,
  OpenRouterResponse,
  OpenRouterStreamChunk,
} from './openrouter-types';

// Agent routing (OpenRouter mode)
export { AgentRouter, FallbackAIProvider } from './agent-router';
export { IntentDetector } from './intent-detector';

// Agent config types and store
export type { TaskType, ModelEntry, TaskConfig, AgentConfig } from './agent-config-types';
export { load as loadAgentConfig, save as saveAgentConfig, getActiveModelsForTask } from './agent-config-store';

// Factory functions
export { createAIProvider, detectIntent, reloadAgentConfig } from './ai-provider-factory';
