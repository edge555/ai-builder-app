/**
 * Tests for ai-provider-factory module
 * Following industry best practices: AAA pattern, clear descriptions, edge cases, proper mocking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createAIProvider,
  detectIntent,
  resetProviderSingletons,
} from '../ai-provider-factory';
import type { AIProvider } from '../ai-provider';
import type { TaskType } from '../agent-config-types';

// Mock the modal-client
vi.mock('../modal-client', () => ({
  createModalClient: vi.fn(),
}));

// Mock the agent-router
vi.mock('../agent-router', () => ({
  AgentRouter: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    createProviderForTask: vi.fn(),
  })),
}));

// Mock the intent-detector
vi.mock('../intent-detector', () => ({
  IntentDetector: vi.fn().mockImplementation(() => ({
    detect: vi.fn(),
  })),
}));

// Mock the provider-config-store
vi.mock('../provider-config-store', () => ({
  getEffectiveProvider: vi.fn(),
}));

// Mock the logger
vi.mock('../../logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { createModalClient } from '../modal-client';
import { AgentRouter } from '../agent-router';
import { IntentDetector } from '../intent-detector';
import { getEffectiveProvider } from '../provider-config-store';

describe('ai-provider-factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetProviderSingletons();
  });

  describe('resetProviderSingletons', () => {
    it('should reset all provider singletons', () => {
      // Arrange
      // No arrangement needed

      // Act
      resetProviderSingletons();

      // Assert
      // The function should complete without errors
      expect(() => resetProviderSingletons()).not.toThrow();
    });

    it('should allow reinitialization after reset', async () => {
      // Arrange
      vi.mocked(getEffectiveProvider).mockResolvedValue('openrouter');
      vi.mocked(AgentRouter).mockImplementation(() => ({
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn(),
      }));

      // Act
      await createAIProvider('coding');
      resetProviderSingletons();
      await createAIProvider('coding');

      // Assert
      expect(AgentRouter).toHaveBeenCalledTimes(2);
    });
  });

  describe('createAIProvider - modal mode', () => {
    beforeEach(() => {
      vi.mocked(getEffectiveProvider).mockResolvedValue('modal');
    });

    it('should create ModalClient when provider is modal', async () => {
      // Arrange
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      vi.mocked(createModalClient).mockReturnValue(mockProvider as any);

      // Act
      const result = await createAIProvider('coding');

      // Assert
      expect(createModalClient).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockProvider);
    });

    it('should ignore taskType in modal mode', async () => {
      // Arrange
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      vi.mocked(createModalClient).mockReturnValue(mockProvider as any);

      // Act
      const result1 = await createAIProvider('coding');
      const result2 = await createAIProvider('planning');
      const result3 = await createAIProvider('debugging');

      // Assert
      expect(createModalClient).toHaveBeenCalledTimes(3);
      expect(result1).toBe(mockProvider);
      expect(result2).toBe(mockProvider);
      expect(result3).toBe(mockProvider);
    });

    it('should use default taskType when not provided', async () => {
      // Arrange
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      vi.mocked(createModalClient).mockReturnValue(mockProvider as any);

      // Act
      const result = await createAIProvider();

      // Assert
      expect(createModalClient).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockProvider);
    });

    it('should not initialize AgentRouter in modal mode', async () => {
      // Arrange
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      vi.mocked(createModalClient).mockReturnValue(mockProvider as any);

      // Act
      await createAIProvider('coding');

      // Assert
      expect(AgentRouter).not.toHaveBeenCalled();
    });
  });

  describe('createAIProvider - openrouter mode', () => {
    beforeEach(() => {
      vi.mocked(getEffectiveProvider).mockResolvedValue('openrouter');
    });

    it('should initialize AgentRouter on first call', async () => {
      // Arrange
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      const mockRouter = {
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn().mockReturnValue(mockProvider),
      };
      vi.mocked(AgentRouter).mockImplementation(() => mockRouter);

      // Act
      await createAIProvider('coding');

      // Assert
      expect(AgentRouter).toHaveBeenCalledTimes(1);
      expect(mockRouter.init).toHaveBeenCalledTimes(1);
    });

    it('should create provider for specific task type', async () => {
      // Arrange
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      const mockRouter = {
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn().mockReturnValue(mockProvider),
      };
      vi.mocked(AgentRouter).mockImplementation(() => mockRouter);

      // Act
      const result = await createAIProvider('planning');

      // Assert
      expect(mockRouter.createProviderForTask).toHaveBeenCalledWith('planning');
      expect(result).toBe(mockProvider);
    });

    it('should use default taskType when not provided', async () => {
      // Arrange
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      const mockRouter = {
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn().mockReturnValue(mockProvider),
      };
      vi.mocked(AgentRouter).mockImplementation(() => mockRouter);

      // Act
      const result = await createAIProvider();

      // Assert
      expect(mockRouter.createProviderForTask).toHaveBeenCalledWith('coding');
      expect(result).toBe(mockProvider);
    });

    it('should reuse AgentRouter instance on subsequent calls', async () => {
      // Arrange
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      const mockRouter = {
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn().mockReturnValue(mockProvider),
      };
      vi.mocked(AgentRouter).mockImplementation(() => mockRouter);

      // Act
      await createAIProvider('coding');
      await createAIProvider('planning');
      await createAIProvider('debugging');

      // Assert
      expect(AgentRouter).toHaveBeenCalledTimes(1);
      expect(mockRouter.init).toHaveBeenCalledTimes(1);
      expect(mockRouter.createProviderForTask).toHaveBeenCalledTimes(3);
    });

    it('should handle all task types', async () => {
      // Arrange
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      const mockRouter = {
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn().mockReturnValue(mockProvider),
      };
      vi.mocked(AgentRouter).mockImplementation(() => mockRouter);

      const taskTypes: TaskType[] = ['intent', 'planning', 'coding', 'debugging', 'documentation'];

      // Act
      for (const taskType of taskTypes) {
        await createAIProvider(taskType);
      }

      // Assert
      expect(mockRouter.createProviderForTask).toHaveBeenCalledTimes(taskTypes.length);
      taskTypes.forEach((taskType, index) => {
        expect(mockRouter.createProviderForTask).toHaveBeenNthCalledWith(index + 1, taskType);
      });
    });
  });

  describe('createAIProvider - initialization errors', () => {
    it('should handle AgentRouter initialization errors', async () => {
      // Arrange
      vi.mocked(getEffectiveProvider).mockResolvedValue('openrouter');
      const mockRouter = {
        init: vi.fn().mockRejectedValue(new Error('Initialization failed')),
        createProviderForTask: vi.fn(),
      };
      vi.mocked(AgentRouter).mockImplementation(() => mockRouter);

      // Act & Assert
      await expect(createAIProvider('coding')).rejects.toThrow('Initialization failed');
    });

    it('should handle createModalClient errors', async () => {
      // Arrange
      vi.mocked(getEffectiveProvider).mockResolvedValue('modal');
      vi.mocked(createModalClient).mockImplementation(() => {
        throw new Error('Failed to create Modal client');
      });

      // Act & Assert
      await expect(createAIProvider('coding')).rejects.toThrow('Failed to create Modal client');
    });
  });

  describe('createAIProvider - concurrent calls', () => {
    it('should handle concurrent initialization calls', async () => {
      // Arrange
      vi.mocked(getEffectiveProvider).mockResolvedValue('openrouter');
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      const mockRouter = {
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn().mockReturnValue(mockProvider),
      };
      vi.mocked(AgentRouter).mockImplementation(() => mockRouter);

      // Act
      const [result1, result2, result3] = await Promise.all([
        createAIProvider('coding'),
        createAIProvider('planning'),
        createAIProvider('debugging'),
      ]);

      // Assert
      expect(AgentRouter).toHaveBeenCalledTimes(1);
      expect(mockRouter.init).toHaveBeenCalledTimes(1);
      expect(result1).toBe(mockProvider);
      expect(result2).toBe(mockProvider);
      expect(result3).toBe(mockProvider);
    });

    it('should handle initialization failure in concurrent calls', async () => {
      // Arrange
      vi.mocked(getEffectiveProvider).mockResolvedValue('openrouter');
      const mockRouter = {
        init: vi.fn().mockRejectedValue(new Error('Init failed')),
        createProviderForTask: vi.fn(),
      };
      vi.mocked(AgentRouter).mockImplementation(() => mockRouter);

      // Act & Assert
      await expect(
        Promise.all([
          createAIProvider('coding'),
          createAIProvider('planning'),
          createAIProvider('debugging'),
        ])
      ).rejects.toThrow('Init failed');
    });
  });

  describe('detectIntent - modal mode', () => {
    beforeEach(() => {
      vi.mocked(getEffectiveProvider).mockResolvedValue('modal');
    });

    it('should return coding task type in modal mode', async () => {
      // Arrange
      const prompt = 'Create a new component';

      // Act
      const result = await detectIntent(prompt);

      // Assert
      expect(result).toBe('coding');
    });

    it('should ignore prompt content in modal mode', async () => {
      // Arrange
      const prompts = [
        'Create a new component',
        'Debug this issue',
        'Write documentation',
        'Plan the architecture',
      ];

      // Act
      const results = await Promise.all(prompts.map(p => detectIntent(p)));

      // Assert
      results.forEach(result => {
        expect(result).toBe('coding');
      });
    });

    it('should accept optional requestId parameter', async () => {
      // Arrange
      const prompt = 'Test prompt';
      const requestId = 'test-request-123';

      // Act
      const result = await detectIntent(prompt, requestId);

      // Assert
      expect(result).toBe('coding');
    });

    it('should not initialize IntentDetector in modal mode', async () => {
      // Arrange
      const prompt = 'Test prompt';

      // Act
      await detectIntent(prompt);

      // Assert
      expect(IntentDetector).not.toHaveBeenCalled();
    });
  });

  describe('detectIntent - openrouter mode', () => {
    beforeEach(() => {
      vi.mocked(getEffectiveProvider).mockResolvedValue('openrouter');
    });

    it('should initialize IntentDetector on first call', async () => {
      // Arrange
      const mockRouter = {
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn(),
      };
      vi.mocked(AgentRouter).mockImplementation(() => mockRouter);
      const mockDetector = {
        detect: vi.fn().mockResolvedValue('coding' as TaskType),
      };
      vi.mocked(IntentDetector).mockImplementation(() => mockDetector);

      // Act
      await detectIntent('Test prompt');

      // Assert
      expect(IntentDetector).toHaveBeenCalledTimes(1);
    });

    it('should detect intent from prompt', async () => {
      // Arrange
      const mockRouter = {
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn(),
      };
      vi.mocked(AgentRouter).mockImplementation(() => mockRouter);
      const mockDetector = {
        detect: vi.fn().mockResolvedValue('debugging' as TaskType),
      };
      vi.mocked(IntentDetector).mockImplementation(() => mockDetector);

      // Act
      const result = await detectIntent('Debug this issue');

      // Assert
      expect(mockDetector.detect).toHaveBeenCalledWith('Debug this issue', undefined);
      expect(result).toBe('debugging');
    });

    it('should pass requestId to IntentDetector', async () => {
      // Arrange
      const mockRouter = {
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn(),
      };
      vi.mocked(AgentRouter).mockImplementation(() => mockRouter);
      const mockDetector = {
        detect: vi.fn().mockResolvedValue('coding' as TaskType),
      };
      vi.mocked(IntentDetector).mockImplementation(() => mockDetector);

      // Act
      await detectIntent('Test prompt', 'test-request-123');

      // Assert
      expect(mockDetector.detect).toHaveBeenCalledWith('Test prompt', 'test-request-123');
    });

    it('should reuse IntentDetector instance on subsequent calls', async () => {
      // Arrange
      const mockRouter = {
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn(),
      };
      vi.mocked(AgentRouter).mockImplementation(() => mockRouter);
      const mockDetector = {
        detect: vi.fn().mockResolvedValue('coding' as TaskType),
      };
      vi.mocked(IntentDetector).mockImplementation(() => mockDetector);

      // Act
      await detectIntent('Prompt 1');
      await detectIntent('Prompt 2');
      await detectIntent('Prompt 3');

      // Assert
      expect(IntentDetector).toHaveBeenCalledTimes(1);
      expect(mockDetector.detect).toHaveBeenCalledTimes(3);
    });

    it('should handle all detected task types', async () => {
      // Arrange
      const mockRouter = {
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn(),
      };
      vi.mocked(AgentRouter).mockImplementation(() => mockRouter);
      const taskTypes: TaskType[] = ['intent', 'planning', 'coding', 'debugging', 'documentation'];
      let callIndex = 0;
      const mockDetector = {
        detect: vi.fn().mockImplementation(() => {
          return Promise.resolve(taskTypes[callIndex++ % taskTypes.length]);
        }),
      };
      vi.mocked(IntentDetector).mockImplementation(() => mockDetector);

      // Act
      const results = await Promise.all([
        detectIntent('Prompt 1'),
        detectIntent('Prompt 2'),
        detectIntent('Prompt 3'),
        detectIntent('Prompt 4'),
        detectIntent('Prompt 5'),
      ]);

      // Assert
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(taskTypes).toContain(result);
      });
    });
  });

  describe('detectIntent - initialization errors', () => {
    it('should handle AgentRouter initialization errors', async () => {
      // Arrange
      vi.mocked(getEffectiveProvider).mockResolvedValue('openrouter');
      const mockRouter = {
        init: vi.fn().mockRejectedValue(new Error('Init failed')),
        createProviderForTask: vi.fn(),
      };
      vi.mocked(AgentRouter).mockImplementation(() => mockRouter);

      // Act & Assert
      await expect(detectIntent('Test prompt')).rejects.toThrow('Init failed');
    });

    it('should handle IntentDetector detection errors', async () => {
      // Arrange
      vi.mocked(getEffectiveProvider).mockResolvedValue('openrouter');
      const mockRouter = {
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn(),
      };
      vi.mocked(AgentRouter).mockImplementation(() => mockRouter);
      const mockDetector = {
        detect: vi.fn().mockRejectedValue(new Error('Detection failed')),
      };
      vi.mocked(IntentDetector).mockImplementation(() => mockDetector);

      // Act & Assert
      await expect(detectIntent('Test prompt')).rejects.toThrow('Detection failed');
    });
  });

  describe('detectIntent - concurrent calls', () => {
    it('should handle concurrent detection calls', async () => {
      // Arrange
      vi.mocked(getEffectiveProvider).mockResolvedValue('openrouter');
      const mockRouter = {
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn(),
      };
      vi.mocked(AgentRouter).mockImplementation(() => mockRouter);
      const mockDetector = {
        detect: vi.fn().mockImplementation((prompt: string) => {
          return Promise.resolve(prompt.includes('debug') ? 'debugging' : 'coding');
        }),
      };
      vi.mocked(IntentDetector).mockImplementation(() => mockDetector);

      // Act
      const [result1, result2, result3] = await Promise.all([
        detectIntent('Create component'),
        detectIntent('Debug issue'),
        detectIntent('Write docs'),
      ]);

      // Assert
      expect(IntentDetector).toHaveBeenCalledTimes(1);
      expect(result1).toBe('coding');
      expect(result2).toBe('debugging');
      expect(result3).toBe('coding');
    });
  });

  describe('integration - mixed provider modes', () => {
    it('should handle provider switch from modal to openrouter', async () => {
      // Arrange
      vi.mocked(getEffectiveProvider)
        .mockResolvedValueOnce('modal')
        .mockResolvedValueOnce('openrouter');
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      vi.mocked(createModalClient).mockReturnValue(mockProvider as any);
      const mockRouter = {
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn().mockReturnValue(mockProvider),
      };
      vi.mocked(AgentRouter).mockImplementation(() => mockRouter);

      // Act
      await createAIProvider('coding');
      resetProviderSingletons();
      await createAIProvider('coding');

      // Assert
      expect(createModalClient).toHaveBeenCalledTimes(1);
      expect(AgentRouter).toHaveBeenCalledTimes(1);
    });

    it('should handle provider switch from openrouter to modal', async () => {
      // Arrange
      vi.mocked(getEffectiveProvider)
        .mockResolvedValueOnce('openrouter')
        .mockResolvedValueOnce('modal');
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      vi.mocked(createModalClient).mockReturnValue(mockProvider as any);
      const mockRouter = {
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn().mockReturnValue(mockProvider),
      };
      vi.mocked(AgentRouter).mockImplementation(() => mockRouter);

      // Act
      await createAIProvider('coding');
      resetProviderSingletons();
      await createAIProvider('coding');

      // Assert
      expect(AgentRouter).toHaveBeenCalledTimes(1);
      expect(createModalClient).toHaveBeenCalledTimes(1);
    });
  });
});
