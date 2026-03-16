/**
 * Tests for ai-provider-factory module
 * Following industry best practices: AAA pattern, clear descriptions, edge cases, proper mocking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createAIProvider,
  resetProviderSingletons,
} from '../ai-provider-factory';
import type { AIProvider } from '../ai-provider';
import type { TaskType } from '../agent-config-types';

// Mock the modal-pipeline-factory
vi.mock('../modal-pipeline-factory', () => ({
  createModalClientForTask: vi.fn(),
}));

// Mock the agent-router
vi.mock('../agent-router', () => ({
  AgentRouter: vi.fn().mockImplementation(function() {
    return { init: vi.fn().mockResolvedValue(undefined), createProviderForTask: vi.fn() };
  }),
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

import { createModalClientForTask } from '../modal-pipeline-factory';
import { AgentRouter } from '../agent-router';
import { getEffectiveProvider } from '../provider-config-store';

describe('ai-provider-factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetProviderSingletons();
  });

  describe('resetProviderSingletons', () => {
    it('should reset all provider singletons', () => {
      expect(() => resetProviderSingletons()).not.toThrow();
    });

    it('should allow reinitialization after reset', async () => {
      vi.mocked(getEffectiveProvider).mockResolvedValue('openrouter');
      vi.mocked(AgentRouter).mockImplementation(function() {
        return { init: vi.fn().mockResolvedValue(undefined), createProviderForTask: vi.fn() };
      });

      await createAIProvider('execution');
      resetProviderSingletons();
      await createAIProvider('execution');

      expect(AgentRouter).toHaveBeenCalledTimes(2);
    });
  });

  describe('createAIProvider - modal mode', () => {
    beforeEach(() => {
      vi.mocked(getEffectiveProvider).mockResolvedValue('modal');
    });

    it('should create ModalClient when provider is modal', async () => {
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      vi.mocked(createModalClientForTask).mockReturnValue(mockProvider as any);

      const result = await createAIProvider('execution');

      expect(createModalClientForTask).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockProvider);
    });

    it('should pass taskType to createModalClientForTask in modal mode', async () => {
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      vi.mocked(createModalClientForTask).mockReturnValue(mockProvider as any);

      const result1 = await createAIProvider('execution');
      const result2 = await createAIProvider('planning');
      const result3 = await createAIProvider('bugfix');

      expect(createModalClientForTask).toHaveBeenCalledTimes(3);
      expect(createModalClientForTask).toHaveBeenNthCalledWith(1, 'execution');
      expect(createModalClientForTask).toHaveBeenNthCalledWith(2, 'planning');
      expect(createModalClientForTask).toHaveBeenNthCalledWith(3, 'bugfix');
      expect(result1).toBe(mockProvider);
      expect(result2).toBe(mockProvider);
      expect(result3).toBe(mockProvider);
    });

    it('should use default taskType when not provided', async () => {
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      vi.mocked(createModalClientForTask).mockReturnValue(mockProvider as any);

      const result = await createAIProvider();

      expect(createModalClientForTask).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockProvider);
    });

    it('should not initialize AgentRouter in modal mode', async () => {
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      vi.mocked(createModalClientForTask).mockReturnValue(mockProvider as any);

      await createAIProvider('execution');

      expect(AgentRouter).not.toHaveBeenCalled();
    });
  });

  describe('createAIProvider - openrouter mode', () => {
    beforeEach(() => {
      vi.mocked(getEffectiveProvider).mockResolvedValue('openrouter');
    });

    it('should initialize AgentRouter on first call', async () => {
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      const mockRouter = {
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn().mockReturnValue(mockProvider),
      };
      vi.mocked(AgentRouter).mockImplementation(function() { return mockRouter; });

      await createAIProvider('execution');

      expect(AgentRouter).toHaveBeenCalledTimes(1);
      expect(mockRouter.init).toHaveBeenCalledTimes(1);
    });

    it('should create provider for specific task type', async () => {
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      const mockRouter = {
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn().mockReturnValue(mockProvider),
      };
      vi.mocked(AgentRouter).mockImplementation(function() { return mockRouter; });

      const result = await createAIProvider('planning');

      expect(mockRouter.createProviderForTask).toHaveBeenCalledWith('planning');
      expect(result).toBe(mockProvider);
    });

    it('should use default taskType (execution) when not provided', async () => {
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      const mockRouter = {
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn().mockReturnValue(mockProvider),
      };
      vi.mocked(AgentRouter).mockImplementation(function() { return mockRouter; });

      const result = await createAIProvider();

      expect(mockRouter.createProviderForTask).toHaveBeenCalledWith('execution');
      expect(result).toBe(mockProvider);
    });

    it('should reuse AgentRouter instance on subsequent calls', async () => {
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      const mockRouter = {
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn().mockReturnValue(mockProvider),
      };
      vi.mocked(AgentRouter).mockImplementation(function() { return mockRouter; });

      await createAIProvider('execution');
      await createAIProvider('planning');
      await createAIProvider('bugfix');

      expect(AgentRouter).toHaveBeenCalledTimes(1);
      expect(mockRouter.init).toHaveBeenCalledTimes(1);
      expect(mockRouter.createProviderForTask).toHaveBeenCalledTimes(3);
    });

    it('should handle all task types', async () => {
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      const mockRouter = {
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn().mockReturnValue(mockProvider),
      };
      vi.mocked(AgentRouter).mockImplementation(function() { return mockRouter; });

      const taskTypes: TaskType[] = ['intent', 'planning', 'execution', 'bugfix', 'review'];

      for (const taskType of taskTypes) {
        await createAIProvider(taskType);
      }

      expect(mockRouter.createProviderForTask).toHaveBeenCalledTimes(taskTypes.length);
      taskTypes.forEach((taskType, index) => {
        expect(mockRouter.createProviderForTask).toHaveBeenNthCalledWith(index + 1, taskType);
      });
    });
  });

  describe('createAIProvider - initialization errors', () => {
    it('should handle AgentRouter initialization errors', async () => {
      vi.mocked(getEffectiveProvider).mockResolvedValue('openrouter');
      const mockRouter = {
        init: vi.fn().mockRejectedValue(new Error('Initialization failed')),
        createProviderForTask: vi.fn(),
      };
      vi.mocked(AgentRouter).mockImplementation(function() { return mockRouter; });

      await expect(createAIProvider('execution')).rejects.toThrow('Initialization failed');
    });

    it('should handle createModalClientForTask errors', async () => {
      vi.mocked(getEffectiveProvider).mockResolvedValue('modal');
      vi.mocked(createModalClientForTask).mockImplementation(() => {
        throw new Error('Failed to create Modal client');
      });

      await expect(createAIProvider('execution')).rejects.toThrow('Failed to create Modal client');
    });
  });

  describe('createAIProvider - concurrent calls', () => {
    it('should handle concurrent initialization calls', async () => {
      vi.mocked(getEffectiveProvider).mockResolvedValue('openrouter');
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      const mockRouter = {
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn().mockReturnValue(mockProvider),
      };
      vi.mocked(AgentRouter).mockImplementation(function() { return mockRouter; });

      const [result1, result2, result3] = await Promise.all([
        createAIProvider('execution'),
        createAIProvider('planning'),
        createAIProvider('bugfix'),
      ]);

      expect(AgentRouter).toHaveBeenCalledTimes(1);
      expect(mockRouter.init).toHaveBeenCalledTimes(1);
      expect(result1).toBe(mockProvider);
      expect(result2).toBe(mockProvider);
      expect(result3).toBe(mockProvider);
    });

    it('should handle initialization failure in concurrent calls', async () => {
      vi.mocked(getEffectiveProvider).mockResolvedValue('openrouter');
      const mockRouter = {
        init: vi.fn().mockRejectedValue(new Error('Init failed')),
        createProviderForTask: vi.fn(),
      };
      vi.mocked(AgentRouter).mockImplementation(function() { return mockRouter; });

      await expect(
        Promise.all([
          createAIProvider('execution'),
          createAIProvider('planning'),
          createAIProvider('bugfix'),
        ])
      ).rejects.toThrow('Init failed');
    });
  });

  describe('integration - mixed provider modes', () => {
    it('should handle provider switch from modal to openrouter', async () => {
      vi.mocked(getEffectiveProvider)
        .mockResolvedValueOnce('modal')
        .mockResolvedValueOnce('openrouter');
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      vi.mocked(createModalClientForTask).mockReturnValue(mockProvider as any);
      const mockRouter = {
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn().mockReturnValue(mockProvider),
      };
      vi.mocked(AgentRouter).mockImplementation(function() { return mockRouter; });

      await createAIProvider('execution');
      resetProviderSingletons();
      await createAIProvider('execution');

      expect(createModalClientForTask).toHaveBeenCalledTimes(1);
      expect(AgentRouter).toHaveBeenCalledTimes(1);
    });

    it('should handle provider switch from openrouter to modal', async () => {
      // getEffectiveProvider is called twice per createAIProvider call:
      // once in createAIProvider itself, once inside ensureInitialized
      vi.mocked(getEffectiveProvider)
        .mockResolvedValueOnce('openrouter')  // createAIProvider 1st call
        .mockResolvedValueOnce('openrouter')  // ensureInitialized 1st call
        .mockResolvedValueOnce('modal');       // createAIProvider 2nd call (returns early)
      const mockProvider: AIProvider = {
        generate: vi.fn(),
        generateStreaming: vi.fn(),
      };
      vi.mocked(createModalClientForTask).mockReturnValue(mockProvider as any);
      const mockRouter = {
        init: vi.fn().mockResolvedValue(undefined),
        createProviderForTask: vi.fn().mockReturnValue(mockProvider),
      };
      vi.mocked(AgentRouter).mockImplementation(function() { return mockRouter; });

      await createAIProvider('execution');
      resetProviderSingletons();
      await createAIProvider('execution');

      expect(AgentRouter).toHaveBeenCalledTimes(1);
      expect(createModalClientForTask).toHaveBeenCalledTimes(1);
    });
  });
});
