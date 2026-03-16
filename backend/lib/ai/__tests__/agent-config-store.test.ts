/**
 * Tests for agent-config-store module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFile, writeFile, mkdir, unlink, rm } from 'fs/promises';
import { join } from 'path';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
  rm: vi.fn(),
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

// Import after mocking
import { load, save, getActiveModelsForTask } from '../agent-config-store';
import type { AgentConfig, TaskType } from '../agent-config-types';

const makeFullConfig = (overrides: Partial<AgentConfig['tasks']> = {}): AgentConfig => ({
  version: 1,
  tasks: {
    intent: { taskType: 'intent', models: [] },
    planning: { taskType: 'planning', models: [] },
    execution: { taskType: 'execution', models: [] },
    bugfix: { taskType: 'bugfix', models: [] },
    review: { taskType: 'review', models: [] },
    ...overrides,
  },
});

describe('agent-config-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('load', () => {
    it('should load and parse a valid config file', async () => {
      const mockConfig = makeFullConfig({
        intent: { taskType: 'intent', models: [{ id: 'model-1', active: true, priority: 1 }] },
      });

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const result = await load();

      expect(result.version).toBe(1);
      expect(result.tasks.intent.models).toHaveLength(1);
      expect(result.tasks.intent.models[0].id).toBe('model-1');
    });

    it('should return default config when file does not exist (ENOENT)', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(readFile).mockRejectedValue(error);

      const result = await load();

      expect(result.version).toBe(1);
      expect(result.tasks.intent.models).toEqual([]);
      expect(result.tasks.planning.models).toEqual([]);
      expect(result.tasks.execution.models).toEqual([]);
      expect(result.tasks.bugfix.models).toEqual([]);
      expect(result.tasks.review.models).toEqual([]);
    });

    it('should return default config on other read errors', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('Permission denied'));

      const result = await load();

      expect(result.version).toBe(1);
      expect(result.tasks).toBeDefined();
    });

    it('should add missing task types to loaded config', async () => {
      const partialConfig = {
        version: 1,
        tasks: {
          intent: { taskType: 'intent', models: [{ id: 'model-1', active: true, priority: 1 }] },
          // Missing execution, bugfix, review
        },
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(partialConfig));

      const result = await load();

      expect(result.tasks.intent.models).toHaveLength(1);
      expect(result.tasks.planning).toBeDefined();
      expect(result.tasks.execution).toBeDefined();
      expect(result.tasks.bugfix).toBeDefined();
      expect(result.tasks.review).toBeDefined();
    });

    it('should reset to defaults when config has unknown (old) task types', async () => {
      const oldConfig = {
        version: 1,
        tasks: {
          intent: { taskType: 'intent', models: [] },
          planning: { taskType: 'planning', models: [] },
          coding: { taskType: 'coding', models: [] },
          debugging: { taskType: 'debugging', models: [] },
          documentation: { taskType: 'documentation', models: [] },
        },
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(oldConfig));

      const result = await load();

      // Should return default config since old task types are unknown
      expect(result.version).toBe(1);
      expect(result.tasks.execution).toBeDefined();
      expect((result.tasks as any).coding).toBeUndefined();
    });

    it('should handle malformed JSON gracefully', async () => {
      vi.mocked(readFile).mockResolvedValue('not valid json');

      const result = await load();

      expect(result.version).toBe(1);
      expect(result.tasks).toBeDefined();
    });
  });

  describe('save', () => {
    it('should save config to file with proper formatting', async () => {
      const config = makeFullConfig({
        intent: { taskType: 'intent', models: [{ id: 'model-1', active: true, priority: 1 }] },
      });

      await save(config);

      expect(mkdir).toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalled();

      const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenContent);
      expect(parsed.version).toBe(1);
      expect(parsed.tasks.intent.models[0].id).toBe('model-1');
    });

    it('should create directory if it does not exist', async () => {
      const config = makeFullConfig();

      await save(config);

      expect(mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });
  });

  describe('getActiveModelsForTask', () => {
    it('should return active models sorted by priority', () => {
      const config = makeFullConfig({
        intent: {
          taskType: 'intent',
          models: [
            { id: 'model-3', active: true, priority: 3 },
            { id: 'model-1', active: true, priority: 1 },
            { id: 'model-2', active: true, priority: 2 },
          ],
        },
      });

      const result = getActiveModelsForTask(config, 'intent');

      expect(result).toHaveLength(3);
      expect(result[0].priority).toBe(1);
      expect(result[1].priority).toBe(2);
      expect(result[2].priority).toBe(3);
    });

    it('should filter out inactive models', () => {
      const config = makeFullConfig({
        intent: {
          taskType: 'intent',
          models: [
            { id: 'model-1', active: true, priority: 1 },
            { id: 'model-2', active: false, priority: 2 },
            { id: 'model-3', active: true, priority: 3 },
          ],
        },
      });

      const result = getActiveModelsForTask(config, 'intent');

      expect(result).toHaveLength(2);
      expect(result.find(m => m.id === 'model-2')).toBeUndefined();
    });

    it('should return empty array for non-existent task type', () => {
      const config = makeFullConfig();

      const result = getActiveModelsForTask(config, 'nonexistent' as TaskType);

      expect(result).toEqual([]);
    });

    it('should return empty array when no models are configured', () => {
      const config = makeFullConfig();

      const result = getActiveModelsForTask(config, 'intent');

      expect(result).toEqual([]);
    });

    it('should handle all task types', () => {
      const taskTypes: TaskType[] = ['intent', 'planning', 'execution', 'bugfix', 'review'];

      const config = makeFullConfig({
        intent: { taskType: 'intent', models: [{ id: 'intent-model', active: true, priority: 1 }] },
        planning: { taskType: 'planning', models: [{ id: 'planning-model', active: true, priority: 1 }] },
        execution: { taskType: 'execution', models: [{ id: 'execution-model', active: true, priority: 1 }] },
        bugfix: { taskType: 'bugfix', models: [{ id: 'bugfix-model', active: true, priority: 1 }] },
        review: { taskType: 'review', models: [{ id: 'review-model', active: true, priority: 1 }] },
      });

      taskTypes.forEach(taskType => {
        const result = getActiveModelsForTask(config, taskType);
        expect(result).toHaveLength(1);
      });
    });
  });
});
