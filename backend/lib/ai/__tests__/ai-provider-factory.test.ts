/**
 * Tests for ai-provider-factory module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createAIProvider,
  resetProviderSingletons,
} from '../ai-provider-factory';
import type { AIProvider } from '../ai-provider';
import type { TaskType } from '../agent-config-types';

// Mock the agent-router
vi.mock('../agent-router', () => ({
  AgentRouter: vi.fn().mockImplementation(function() {
    return { init: vi.fn().mockResolvedValue(undefined), createProviderForTask: vi.fn() };
  }),
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

import { AgentRouter } from '../agent-router';

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
      vi.mocked(AgentRouter).mockImplementation(function() {
        return { init: vi.fn().mockResolvedValue(undefined), createProviderForTask: vi.fn() };
      });

      await createAIProvider('execution');
      resetProviderSingletons();
      await createAIProvider('execution');

      expect(AgentRouter).toHaveBeenCalledTimes(2);
    });
  });

  describe('createAIProvider', () => {
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

  describe('initialization errors', () => {
    it('should handle AgentRouter initialization errors', async () => {
      const mockRouter = {
        init: vi.fn().mockRejectedValue(new Error('Initialization failed')),
        createProviderForTask: vi.fn(),
      };
      vi.mocked(AgentRouter).mockImplementation(function() { return mockRouter; });

      await expect(createAIProvider('execution')).rejects.toThrow('Initialization failed');
    });
  });

  describe('concurrent calls', () => {
    it('should handle concurrent initialization calls', async () => {
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
});
