/**
 * Tests for agent-router module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRouter, FallbackAIProvider } from '../agent-router';
import type { AgentConfig, TaskType } from '../agent-config-types';
import type { AIProvider, AIRequest, AIStreamingRequest, AIResponse } from '../ai-provider';

// Mock the agent-config-store
vi.mock('../agent-config-store', () => ({
  load: vi.fn(),
  getActiveModelsForTask: vi.fn(),
}));

// Mock the OpenRouterClient
vi.mock('../openrouter-client', () => ({
  OpenRouterClient: vi.fn().mockImplementation(function() {
    return { generate: vi.fn(), generateStreaming: vi.fn() };
  }),
}));

// Mock the config
vi.mock('../config', () => ({
  config: {
    provider: {
      openrouterApiKey: 'test-api-key',
      openrouterTimeout: 30000,
    },
    api: {
      maxRetries: 3,
      retryBaseDelay: 1000,
    },
  },
}));

// Mock the logger
vi.mock('../logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock the metrics
vi.mock('../metrics', () => ({
  OperationTimer: vi.fn().mockImplementation(function() {
    return { complete: vi.fn(() => ({ durationMs: 100 })) };
  }),
  formatMetrics: vi.fn(() => ({ durationMs: 100 })),
}));

import { load, getActiveModelsForTask } from '../agent-config-store';
import { OpenRouterClient } from '../openrouter-client';

describe('AgentRouter', () => {
  let router: AgentRouter;
  let mockConfig: AgentConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockConfig = {
      version: 1,
      tasks: {
        intent: {
          taskType: 'intent',
          models: [
            { id: 'model-1', active: true, priority: 1 },
            { id: 'model-2', active: true, priority: 2 },
          ],
        },
        coding: {
          taskType: 'coding',
          models: [
            { id: 'model-3', active: true, priority: 1 },
          ],
        },
        planning: {
          taskType: 'planning',
          models: [
            { id: 'model-4', active: true, priority: 1 },
            { id: 'model-5', active: true, priority: 2 },
          ],
        },
        debugging: {
          taskType: 'debugging',
          models: [
            { id: 'model-6', active: true, priority: 1 },
          ],
        },
        documentation: {
          taskType: 'documentation',
          models: [
            { id: 'model-7', active: true, priority: 1 },
          ],
        },
      },
    };

    vi.mocked(load).mockResolvedValue(mockConfig);
    vi.mocked(getActiveModelsForTask).mockImplementation((config, taskType) => {
      return config.tasks[taskType].models.filter(m => m.active);
    });

    router = new AgentRouter();
  });

  describe('init', () => {
    it('should initialize and load agent config', async () => {
      await router.init();
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('should handle initialization errors gracefully', async () => {
      vi.mocked(load).mockRejectedValue(new Error('Failed to load config'));
      await expect(router.init()).rejects.toThrow('Failed to load config');
    });
  });

  describe('reload', () => {
    it('should reload agent config', async () => {
      await router.init();
      await router.reload();
      expect(load).toHaveBeenCalledTimes(2);
    });
  });

  describe('createProviderForTask', () => {
    beforeEach(async () => {
      await router.init();
    });

    it('should create provider for coding task', () => {
      const provider = router.createProviderForTask('coding');
      expect(provider).toBeInstanceOf(FallbackAIProvider);
    });

    it('should create provider for intent task', () => {
      const provider = router.createProviderForTask('intent');
      expect(provider).toBeInstanceOf(FallbackAIProvider);
    });

    it('should create provider for planning task', () => {
      const provider = router.createProviderForTask('planning');
      expect(provider).toBeInstanceOf(FallbackAIProvider);
    });

    it('should create provider for debugging task', () => {
      const provider = router.createProviderForTask('debugging');
      expect(provider).toBeInstanceOf(FallbackAIProvider);
    });

    it('should create provider for documentation task', () => {
      const provider = router.createProviderForTask('documentation');
      expect(provider).toBeInstanceOf(FallbackAIProvider);
    });

    it('should throw error if not initialized', () => {
      const uninitializedRouter = new AgentRouter();
      expect(() => uninitializedRouter.createProviderForTask('coding')).toThrow(
        'not initialized — call init() first'
      );
    });

    it('should throw error when no active models for task', () => {
      vi.mocked(getActiveModelsForTask).mockReturnValue([]);
      expect(() => router.createProviderForTask('coding')).toThrow(
        'Active models not found: task type coding'
      );
    });
  });
});

describe('FallbackAIProvider', () => {
  let provider: FallbackAIProvider;
  let mockClients: any[];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock clients
    mockClients = [
      {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      },
      {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      },
      {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      },
    ];

    provider = new FallbackAIProvider(
      'coding',
      ['model-1', 'model-2', 'model-3'],
      mockClients as any
    );
  });

  describe('generate', () => {
    it('should succeed on first model', async () => {
      const mockResponse: AIResponse = {
        success: true,
        content: 'Generated content',
        modelId: 'model-1',
      };
      mockClients[0].generate.mockResolvedValue(mockResponse);

      const request: AIRequest = {
        prompt: 'Test prompt',
        requestId: 'test-request-1',
      };

      const result = await provider.generate(request);
      expect(result).toEqual(mockResponse);
      expect(mockClients[0].generate).toHaveBeenCalledWith(request);
      expect(mockClients[1].generate).not.toHaveBeenCalled();
    });

    it('should fallback to second model when first fails', async () => {
      const mockResponse: AIResponse = {
        success: true,
        content: 'Generated content',
        modelId: 'model-2',
      };
      
      mockClients[0].generate.mockResolvedValue({
        success: false,
        error: 'First model failed',
      });
      mockClients[1].generate.mockResolvedValue(mockResponse);

      const request: AIRequest = {
        prompt: 'Test prompt',
        requestId: 'test-request-2',
      };

      const result = await provider.generate(request);
      expect(result).toEqual(mockResponse);
      expect(mockClients[0].generate).toHaveBeenCalledWith(request);
      expect(mockClients[1].generate).toHaveBeenCalledWith(request);
      expect(mockClients[2].generate).not.toHaveBeenCalled();
    });

    it('should try all models and return last response if all fail', async () => {
      mockClients[0].generate.mockResolvedValue({
        success: false,
        error: 'First model failed',
      });
      mockClients[1].generate.mockResolvedValue({
        success: false,
        error: 'Second model failed',
      });
      mockClients[2].generate.mockResolvedValue({
        success: false,
        error: 'Third model failed',
      });

      const request: AIRequest = {
        prompt: 'Test prompt',
        requestId: 'test-request-3',
      };

      const result = await provider.generate(request);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Third model failed');
      expect(mockClients[0].generate).toHaveBeenCalledWith(request);
      expect(mockClients[1].generate).toHaveBeenCalledWith(request);
      expect(mockClients[2].generate).toHaveBeenCalledWith(request);
    });

    it('should handle partial success with fallback', async () => {
      const mockResponse: AIResponse = {
        success: true,
        content: 'Partial content',
        modelId: 'model-2',
      };
      
      mockClients[0].generate.mockResolvedValue({
        success: false,
        error: 'First model failed',
      });
      mockClients[1].generate.mockResolvedValue(mockResponse);

      const request: AIRequest = {
        prompt: 'Test prompt',
        requestId: 'test-request-4',
      };

      const result = await provider.generate(request);
      expect(result.success).toBe(true);
      expect(result.content).toBe('Partial content');
    });
  });

  describe('generateStreaming', () => {
    it('should succeed on first model with streaming', async () => {
      const mockResponse: AIResponse = {
        success: true,
        content: 'Streamed content',
        modelId: 'model-1',
      };
      mockClients[0].generateStreaming.mockResolvedValue(mockResponse);

      const request: AIStreamingRequest = {
        prompt: 'Test prompt',
        onChunk: vi.fn(),
        requestId: 'test-request-5',
      };

      const result = await provider.generateStreaming(request);
      expect(result).toEqual(mockResponse);
      expect(mockClients[0].generateStreaming).toHaveBeenCalledWith(request);
      expect(mockClients[1].generateStreaming).not.toHaveBeenCalled();
    });

    it('should fallback to second model when first fails in streaming', async () => {
      const mockResponse: AIResponse = {
        success: true,
        content: 'Streamed content',
        modelId: 'model-2',
      };
      
      mockClients[0].generateStreaming.mockResolvedValue({
        success: false,
        error: 'First model failed',
      });
      mockClients[1].generateStreaming.mockResolvedValue(mockResponse);

      const request: AIStreamingRequest = {
        prompt: 'Test prompt',
        onChunk: vi.fn(),
        requestId: 'test-request-6',
      };

      const result = await provider.generateStreaming(request);
      expect(result).toEqual(mockResponse);
      expect(mockClients[0].generateStreaming).toHaveBeenCalledWith(request);
      expect(mockClients[1].generateStreaming).toHaveBeenCalledWith(request);
      expect(mockClients[2].generateStreaming).not.toHaveBeenCalled();
    });

    it('should call onChunk callback during streaming', async () => {
      const mockResponse: AIResponse = {
        success: true,
        content: 'Streamed content',
        modelId: 'model-1',
      };
      
      const onChunk = vi.fn();
      mockClients[0].generateStreaming.mockImplementation(async (request: AIStreamingRequest) => {
        if (request.onChunk) {
          request.onChunk('Hello', 5);
          request.onChunk(' world', 11);
        }
        return mockResponse;
      });

      const request: AIStreamingRequest = {
        prompt: 'Test prompt',
        onChunk,
        requestId: 'test-request-7',
      };

      const result = await provider.generateStreaming(request);
      expect(result).toEqual(mockResponse);
      expect(onChunk).toHaveBeenCalledWith('Hello', 5);
      expect(onChunk).toHaveBeenCalledWith(' world', 11);
    });

    it('should try all models in streaming mode and return last response if all fail', async () => {
      mockClients[0].generateStreaming.mockResolvedValue({
        success: false,
        error: 'First model failed',
      });
      mockClients[1].generateStreaming.mockResolvedValue({
        success: false,
        error: 'Second model failed',
      });
      mockClients[2].generateStreaming.mockResolvedValue({
        success: false,
        error: 'Third model failed',
      });

      const request: AIStreamingRequest = {
        prompt: 'Test prompt',
        onChunk: vi.fn(),
        requestId: 'test-request-8',
      };

      const result = await provider.generateStreaming(request);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Third model failed');
    });
  });

  describe('error handling', () => {
    it('should handle client errors gracefully', async () => {
      mockClients[0].generate.mockRejectedValue(new Error('Client error'));
      mockClients[1].generate.mockResolvedValue({
        success: true,
        content: 'Success',
        modelId: 'model-2',
      });

      const request: AIRequest = {
        prompt: 'Test prompt',
        requestId: 'test-request-9',
      };

      const result = await provider.generate(request);
      expect(result.success).toBe(true);
    });

    it('should handle timeout errors', async () => {
      mockClients[0].generate.mockResolvedValue({
        success: false,
        error: 'Request timeout',
        errorType: 'timeout',
      });
      mockClients[1].generate.mockResolvedValue({
        success: true,
        content: 'Success',
        modelId: 'model-2',
      });

      const request: AIRequest = {
        prompt: 'Test prompt',
        requestId: 'test-request-10',
      };

      const result = await provider.generate(request);
      expect(result.success).toBe(true);
    });

    it('should handle rate limit errors', async () => {
      mockClients[0].generate.mockResolvedValue({
        success: false,
        error: 'Rate limit exceeded',
        errorType: 'rate_limit',
      });
      mockClients[1].generate.mockResolvedValue({
        success: true,
        content: 'Success',
        modelId: 'model-2',
      });

      const request: AIRequest = {
        prompt: 'Test prompt',
        requestId: 'test-request-11',
      };

      const result = await provider.generate(request);
      expect(result.success).toBe(true);
    });
  });

  describe('task types', () => {
    it('should handle different task types correctly', () => {
      const taskTypes: TaskType[] = ['intent', 'planning', 'coding', 'debugging', 'documentation'];
      
      taskTypes.forEach(taskType => {
        const provider = new FallbackAIProvider(
          taskType,
          ['model-1'],
          [mockClients[0]]
        );
        expect(provider).toBeInstanceOf(FallbackAIProvider);
      });
    });
  });
});
