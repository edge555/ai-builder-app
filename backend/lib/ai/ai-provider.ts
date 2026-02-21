/**
 * AI Provider Interface
 * Defines the contract that all AI providers (Gemini, Modal, etc.) must implement.
 * Type aliases reference existing Gemini types which are already provider-agnostic in shape.
 */

import type { GeminiRequest, GeminiStreamingRequest, GeminiResponse } from './gemini-types';

/** Provider-agnostic request type */
export type AIRequest = GeminiRequest;

/** Provider-agnostic streaming request type */
export type AIStreamingRequest = GeminiStreamingRequest;

/** Provider-agnostic response type */
export type AIResponse = GeminiResponse;

/**
 * Interface that all AI providers must implement.
 */
export interface AIProvider {
  /** Send a request and return the full response */
  generate(request: AIRequest): Promise<AIResponse>;

  /** Send a streaming request, calling onChunk as content arrives */
  generateStreaming(request: AIStreamingRequest): Promise<AIResponse>;
}
