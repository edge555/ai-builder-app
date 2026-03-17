/**
 * Tests for intent-detector module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IntentDetector } from '../intent-detector';
import type { AgentRouter } from '../agent-router';
import type { AIProvider, AIResponse } from '../ai-provider';

// Mock the logger
vi.mock('../logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  })),
}));

// Mock the metrics
vi.mock('../metrics', () => ({
  OperationTimer: vi.fn().mockImplementation(function() {
    return { complete: vi.fn(() => ({ durationMs: 100 })) };
  }),
  formatMetrics: vi.fn(() => ({ durationMs: 100 })),
}));

describe('IntentDetector', () => {
  let detector: IntentDetector;
  let mockAgentRouter: AgentRouter;
  let mockProvider: AIProvider;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock provider
    mockProvider = {
      generate: vi.fn(),
      generateStreaming: vi.fn(),
    };

    // Create mock agent router
    mockAgentRouter = {
      createProviderForTask: vi.fn(),
    } as unknown as AgentRouter;

    detector = new IntentDetector(mockAgentRouter);
  });

  describe('detect', () => {
    it('should classify execution intent correctly', async () => {
      const mockResponse: AIResponse = {
        success: true,
        content: 'execution',
        modelId: 'model-1',
      };
      mockProvider.generate = vi.fn().mockResolvedValue(mockResponse);
      vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

      const result = await detector.detect('Create a new React component');
      expect(result).toBe('execution');
      expect(mockProvider.generate).toHaveBeenCalledWith({
        prompt: 'Create a new React component',
        systemInstruction: expect.stringContaining('task classifier'),
        temperature: 0.1,
        maxOutputTokens: 50,
        requestId: undefined,
      });
    });

    it('should classify bugfix intent correctly', async () => {
      const mockResponse: AIResponse = {
        success: true,
        content: 'bugfix',
        modelId: 'model-1',
      };
      mockProvider.generate = vi.fn().mockResolvedValue(mockResponse);
      vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

      const result = await detector.detect('Fix the bug in the login function');
      expect(result).toBe('bugfix');
    });

    it('should classify planning intent correctly', async () => {
      const mockResponse: AIResponse = {
        success: true,
        content: 'planning',
        modelId: 'model-1',
      };
      mockProvider.generate = vi.fn().mockResolvedValue(mockResponse);
      vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

      const result = await detector.detect('Plan the architecture for a new feature');
      expect(result).toBe('planning');
    });

    it('should default to execution for removed task types (e.g. documentation)', async () => {
      const mockResponse: AIResponse = {
        success: true,
        content: 'documentation',
        modelId: 'model-1',
      };
      mockProvider.generate = vi.fn().mockResolvedValue(mockResponse);
      vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

      const result = await detector.detect('Write documentation for the API');
      expect(result).toBe('execution');
    });

    it('should default to execution when intent is not recognized', async () => {
      const mockResponse: AIResponse = {
        success: true,
        content: 'unknown-task',
        modelId: 'model-1',
      };
      mockProvider.generate = vi.fn().mockResolvedValue(mockResponse);
      vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

      const result = await detector.detect('Do something');
      expect(result).toBe('execution');
    });

    it('should handle case-insensitive responses', async () => {
      const mockResponse: AIResponse = {
        success: true,
        content: 'EXECUTION',
        modelId: 'model-1',
      };
      mockProvider.generate = vi.fn().mockResolvedValue(mockResponse);
      vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

      const result = await detector.detect('Create a new component');
      expect(result).toBe('execution');
    });

    it('should handle responses with extra whitespace', async () => {
      const mockResponse: AIResponse = {
        success: true,
        content: '  execution  ',
        modelId: 'model-1',
      };
      mockProvider.generate = vi.fn().mockResolvedValue(mockResponse);
      vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

      const result = await detector.detect('Create a new component');
      expect(result).toBe('execution');
    });

    it('should handle responses with partial matches', async () => {
      const mockResponse: AIResponse = {
        success: true,
        content: 'I think this is an execution task',
        modelId: 'model-1',
      };
      mockProvider.generate = vi.fn().mockResolvedValue(mockResponse);
      vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

      const result = await detector.detect('Create a new component');
      expect(result).toBe('execution');
    });

    it('should default to execution when provider returns unsuccessful response', async () => {
      const mockResponse: AIResponse = {
        success: false,
        error: 'API error',
      };
      mockProvider.generate = vi.fn().mockResolvedValue(mockResponse);
      vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

      const result = await detector.detect('Create a new component');
      expect(result).toBe('execution');
    });

    it('should default to execution when provider returns no content', async () => {
      const mockResponse: AIResponse = {
        success: true,
        content: undefined,
      };
      mockProvider.generate = vi.fn().mockResolvedValue(mockResponse);
      vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

      const result = await detector.detect('Create a new component');
      expect(result).toBe('execution');
    });

    it('should default to execution when no intent models are configured', async () => {
      vi.mocked(mockAgentRouter.createProviderForTask).mockImplementation(() => {
        throw new Error('No active intent models');
      });

      const result = await detector.detect('Create a new component');
      expect(result).toBe('execution');
    });

    it('should default to execution when provider throws an error', async () => {
      mockProvider.generate = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

      const result = await detector.detect('Create a new component');
      expect(result).toBe('execution');
    });

    it('should pass requestId to provider', async () => {
      const mockResponse: AIResponse = {
        success: true,
        content: 'execution',
        modelId: 'model-1',
      };
      mockProvider.generate = vi.fn().mockResolvedValue(mockResponse);
      vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

      const result = await detector.detect('Create a new component', 'test-request-id');
      expect(result).toBe('execution');
      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'test-request-id',
        })
      );
    });

    it('should handle empty response content', async () => {
      const mockResponse: AIResponse = {
        success: true,
        content: '',
        modelId: 'model-1',
      };
      mockProvider.generate = vi.fn().mockResolvedValue(mockResponse);
      vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

      const result = await detector.detect('Create a new component');
      expect(result).toBe('execution');
    });

    it('should handle null response content', async () => {
      const mockResponse: AIResponse = {
        success: true,
        content: null as unknown as string,
        modelId: 'model-1',
      };
      mockProvider.generate = vi.fn().mockResolvedValue(mockResponse);
      vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

      const result = await detector.detect('Create a new component');
      expect(result).toBe('execution');
    });

    it('should handle response with punctuation', async () => {
      const mockResponse: AIResponse = {
        success: true,
        content: 'execution.',
        modelId: 'model-1',
      };
      mockProvider.generate = vi.fn().mockResolvedValue(mockResponse);
      vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

      const result = await detector.detect('Create a new component');
      expect(result).toBe('execution');
    });

    it('should use low temperature for deterministic classification', async () => {
      const mockResponse: AIResponse = {
        success: true,
        content: 'execution',
        modelId: 'model-1',
      };
      mockProvider.generate = vi.fn().mockResolvedValue(mockResponse);
      vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

      await detector.detect('Create a new component');
      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.1,
        })
      );
    });

    it('should limit output tokens for efficiency', async () => {
      const mockResponse: AIResponse = {
        success: true,
        content: 'execution',
        modelId: 'model-1',
      };
      mockProvider.generate = vi.fn().mockResolvedValue(mockResponse);
      vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

      await detector.detect('Create a new component');
      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          maxOutputTokens: 50,
        })
      );
    });

    it('should include system instruction for task classification', async () => {
      const mockResponse: AIResponse = {
        success: true,
        content: 'execution',
        modelId: 'model-1',
      };
      mockProvider.generate = vi.fn().mockResolvedValue(mockResponse);
      vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

      await detector.detect('Create a new component');
      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          systemInstruction: expect.stringContaining('task classifier'),
        })
      );
    });

    it('should handle multiple valid task types in response', async () => {
      const mockResponse: AIResponse = {
        success: true,
        content: 'This involves both execution and bugfix',
        modelId: 'model-1',
      };
      mockProvider.generate = vi.fn().mockResolvedValue(mockResponse);
      vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

      const result = await detector.detect('Fix the bug and add new feature');
      // Should match the first valid task type found
      expect(['execution', 'bugfix']).toContain(result);
    });

    it('should handle very long prompts', async () => {
      const longPrompt = 'Create a component '.repeat(1000);
      const mockResponse: AIResponse = {
        success: true,
        content: 'execution',
        modelId: 'model-1',
      };
      mockProvider.generate = vi.fn().mockResolvedValue(mockResponse);
      vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

      const result = await detector.detect(longPrompt);
      expect(result).toBe('execution');
      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: longPrompt,
        })
      );
    });

    it('should handle special characters in prompt', async () => {
      const specialPrompt = 'Create a component with emojis 🎉 and symbols @#$%';
      const mockResponse: AIResponse = {
        success: true,
        content: 'execution',
        modelId: 'model-1',
      };
      mockProvider.generate = vi.fn().mockResolvedValue(mockResponse);
      vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

      const result = await detector.detect(specialPrompt);
      expect(result).toBe('execution');
    });
  });

  describe('fallback behavior', () => {
    it('should consistently fallback to execution on errors', async () => {
      const testCases = [
        { error: 'Network error', method: 'reject' },
        { error: 'Timeout', method: 'reject' },
        { error: 'Rate limit', method: 'resolve' },
        { error: 'Invalid response', method: 'resolve' },
      ];

      for (const testCase of testCases) {
        vi.clearAllMocks();

        if (testCase.method === 'reject') {
          mockProvider.generate = vi.fn().mockRejectedValue(new Error(testCase.error));
        } else {
          mockProvider.generate = vi.fn().mockResolvedValue({
            success: false,
            error: testCase.error,
          });
        }

        vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

        const result = await detector.detect('Test prompt');
        expect(result).toBe('execution');
      }
    });

    it('should fallback to execution when no active models', async () => {
      vi.mocked(mockAgentRouter.createProviderForTask).mockImplementation(() => {
        throw new Error('No active models for intent task');
      });

      const result = await detector.detect('Test prompt');
      expect(result).toBe('execution');
    });
  });

  describe('valid task types', () => {
    it('should only recognize valid task types', async () => {
      const validTaskTypes = ['execution', 'bugfix', 'planning'];

      for (const taskType of validTaskTypes) {
        vi.clearAllMocks();

        const mockResponse: AIResponse = {
          success: true,
          content: taskType,
          modelId: 'model-1',
        };
        mockProvider.generate = vi.fn().mockResolvedValue(mockResponse);
        vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

        const result = await detector.detect('Test prompt');
        expect(result).toBe(taskType);
      }
    });

    it('should reject invalid task types', async () => {
      const invalidTaskTypes = ['invalid', 'random', 'test', 'unknown'];

      for (const taskType of invalidTaskTypes) {
        vi.clearAllMocks();

        const mockResponse: AIResponse = {
          success: true,
          content: taskType,
          modelId: 'model-1',
        };
        mockProvider.generate = vi.fn().mockResolvedValue(mockResponse);
        vi.mocked(mockAgentRouter.createProviderForTask).mockReturnValue(mockProvider);

        const result = await detector.detect('Test prompt');
        expect(result).toBe('execution'); // Should fallback to default
      }
    });
  });
});
