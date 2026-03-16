/**
 * Tests for modal-pipeline-factory module
 *
 * Covers:
 * - Task-specific URL takes priority over MODAL_DEFAULT_URL
 * - Falls back to MODAL_DEFAULT_URL when task URL is absent
 * - Throws a descriptive error when neither URL is configured
 * - Stream URL resolution follows the same pattern (non-fatal absence)
 * - All 5 task types resolve correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TaskType } from '../agent-config-types';

// Hoisted so it can be referenced inside vi.mock factories below.
// Mutable — each test resets it to a clean slate in beforeEach.
const mockProviderConfig = vi.hoisted(() => ({
  modalDefaultUrl:       undefined as string | undefined,
  modalDefaultStreamUrl: undefined as string | undefined,
  modalIntentUrl:        undefined as string | undefined,
  modalIntentStreamUrl:  undefined as string | undefined,
  modalPlanningUrl:      undefined as string | undefined,
  modalPlanningStreamUrl:undefined as string | undefined,
  modalExecutionUrl:     undefined as string | undefined,
  modalExecutionStreamUrl:undefined as string | undefined,
  modalBugfixUrl:        undefined as string | undefined,
  modalBugfixStreamUrl:  undefined as string | undefined,
  modalReviewUrl:        undefined as string | undefined,
  modalReviewStreamUrl:  undefined as string | undefined,
  modalApiKey:           'test-api-key' as string | undefined,
}));

vi.mock('../../config', () => ({
  config: { provider: mockProviderConfig },
}));

vi.mock('../modal-client', () => ({
  ModalClient: vi.fn().mockImplementation(function(this: any, opts: any) {
    this.opts = opts;
  }),
}));

vi.mock('@ai-app-builder/shared/utils', () => ({
  envVarError: vi.fn((name: string, msg: string) => `Missing ${name}: ${msg}`),
}));

import { createModalClientForTask } from '../modal-pipeline-factory';
import { ModalClient } from '../modal-client';

// Maps each TaskType to the config field that holds its non-stream URL
const TASK_URL_KEY: Record<TaskType, keyof typeof mockProviderConfig> = {
  intent:    'modalIntentUrl',
  planning:  'modalPlanningUrl',
  execution: 'modalExecutionUrl',
  bugfix:    'modalBugfixUrl',
  review:    'modalReviewUrl',
};

const TASK_STREAM_URL_KEY: Record<TaskType, keyof typeof mockProviderConfig> = {
  intent:    'modalIntentStreamUrl',
  planning:  'modalPlanningStreamUrl',
  execution: 'modalExecutionStreamUrl',
  bugfix:    'modalBugfixStreamUrl',
  review:    'modalReviewStreamUrl',
};

const ALL_TASK_TYPES: TaskType[] = ['intent', 'planning', 'execution', 'bugfix', 'review'];

describe('createModalClientForTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset every URL field to undefined between tests
    for (const key of Object.keys(mockProviderConfig) as (keyof typeof mockProviderConfig)[]) {
      if (key !== 'modalApiKey') {
        mockProviderConfig[key] = undefined;
      }
    }
  });

  // ─── Task-specific URL priority ────────────────────────────────────────────

  describe('task-specific URL takes priority over default', () => {
    it('uses MODAL_INTENT_URL when set, not MODAL_DEFAULT_URL', () => {
      mockProviderConfig.modalIntentUrl    = 'http://intent-endpoint/api';
      mockProviderConfig.modalDefaultUrl   = 'http://default-endpoint/api';

      createModalClientForTask('intent');

      expect(ModalClient).toHaveBeenCalledWith(
        expect.objectContaining({ apiUrl: 'http://intent-endpoint/api' })
      );
    });

    it('uses MODAL_EXECUTION_URL when set, not MODAL_DEFAULT_URL', () => {
      mockProviderConfig.modalExecutionUrl = 'http://execution-endpoint/api';
      mockProviderConfig.modalDefaultUrl   = 'http://default-endpoint/api';

      createModalClientForTask('execution');

      expect(ModalClient).toHaveBeenCalledWith(
        expect.objectContaining({ apiUrl: 'http://execution-endpoint/api' })
      );
    });
  });

  // ─── Default URL fallback ──────────────────────────────────────────────────

  describe('falls back to MODAL_DEFAULT_URL when task URL is absent', () => {
    it('uses MODAL_DEFAULT_URL for execution when MODAL_EXECUTION_URL is not set', () => {
      mockProviderConfig.modalDefaultUrl = 'http://default-endpoint/api';

      createModalClientForTask('execution');

      expect(ModalClient).toHaveBeenCalledWith(
        expect.objectContaining({ apiUrl: 'http://default-endpoint/api' })
      );
    });

    it('uses MODAL_DEFAULT_URL for planning when MODAL_PLANNING_URL is not set', () => {
      mockProviderConfig.modalDefaultUrl = 'http://default-endpoint/api';

      createModalClientForTask('planning');

      expect(ModalClient).toHaveBeenCalledWith(
        expect.objectContaining({ apiUrl: 'http://default-endpoint/api' })
      );
    });
  });

  // ─── Error when no URL is configured ──────────────────────────────────────

  describe('throws when neither task URL nor default URL is set', () => {
    it('throws for planning with no URLs configured', () => {
      expect(() => createModalClientForTask('planning')).toThrow();
    });

    it('error message references the task type', () => {
      expect(() => createModalClientForTask('planning')).toThrow(/planning/i);
    });

    it('error message references the env var names', () => {
      expect(() => createModalClientForTask('intent')).toThrow(/MODAL_INTENT_URL/i);
    });
  });

  // ─── Stream URL resolution ─────────────────────────────────────────────────

  describe('stream URL resolution', () => {
    it('uses task-specific stream URL when set', () => {
      mockProviderConfig.modalIntentUrl       = 'http://intent/api';
      mockProviderConfig.modalIntentStreamUrl = 'http://intent/stream';

      createModalClientForTask('intent');

      expect(ModalClient).toHaveBeenCalledWith(
        expect.objectContaining({ streamApiUrl: 'http://intent/stream' })
      );
    });

    it('falls back to MODAL_DEFAULT_STREAM_URL when task stream URL is not set', () => {
      mockProviderConfig.modalDefaultUrl       = 'http://default/api';
      mockProviderConfig.modalDefaultStreamUrl = 'http://default/stream';

      createModalClientForTask('execution');

      expect(ModalClient).toHaveBeenCalledWith(
        expect.objectContaining({ streamApiUrl: 'http://default/stream' })
      );
    });

    it('stream URL is undefined (non-fatal) when neither stream URL is set', () => {
      mockProviderConfig.modalDefaultUrl = 'http://default/api';
      // No stream URLs configured

      expect(() => createModalClientForTask('execution')).not.toThrow();
      expect(ModalClient).toHaveBeenCalledWith(
        expect.objectContaining({ streamApiUrl: undefined })
      );
    });
  });

  // ─── ModalClient constructor args ──────────────────────────────────────────

  describe('ModalClient constructor receives correct arguments', () => {
    it('passes the resolved apiUrl', () => {
      mockProviderConfig.modalDefaultUrl = 'http://default/api';

      createModalClientForTask('bugfix');

      expect(ModalClient).toHaveBeenCalledWith(
        expect.objectContaining({ apiUrl: 'http://default/api' })
      );
    });

    it('passes the configured apiKey', () => {
      mockProviderConfig.modalDefaultUrl = 'http://default/api';
      mockProviderConfig.modalApiKey     = 'my-secret-key';

      createModalClientForTask('review');

      expect(ModalClient).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'my-secret-key' })
      );
    });

    it('returns the constructed ModalClient instance', () => {
      mockProviderConfig.modalDefaultUrl = 'http://default/api';

      const result = createModalClientForTask('intent');

      expect(result).toBeInstanceOf(ModalClient);
    });
  });

  // ─── All 5 task types ──────────────────────────────────────────────────────

  describe('all 5 task types resolve correctly', () => {
    it.each(ALL_TASK_TYPES)('%s falls back to default URL when task URL not set', (taskType) => {
      mockProviderConfig.modalDefaultUrl = 'http://default/api';

      createModalClientForTask(taskType);

      expect(ModalClient).toHaveBeenCalledWith(
        expect.objectContaining({ apiUrl: 'http://default/api' })
      );
    });

    it.each(ALL_TASK_TYPES)('%s uses its own task URL when set', (taskType) => {
      const urlKey = TASK_URL_KEY[taskType];
      mockProviderConfig[urlKey] = `http://${taskType}-specific/api`;
      mockProviderConfig.modalDefaultUrl = 'http://default/api';

      createModalClientForTask(taskType);

      expect(ModalClient).toHaveBeenCalledWith(
        expect.objectContaining({ apiUrl: `http://${taskType}-specific/api` })
      );
    });

    it.each(ALL_TASK_TYPES)('%s uses its own stream URL when set', (taskType) => {
      const urlKey       = TASK_URL_KEY[taskType];
      const streamUrlKey = TASK_STREAM_URL_KEY[taskType];
      mockProviderConfig[urlKey]       = `http://${taskType}/api`;
      mockProviderConfig[streamUrlKey] = `http://${taskType}/stream`;

      createModalClientForTask(taskType);

      expect(ModalClient).toHaveBeenCalledWith(
        expect.objectContaining({ streamApiUrl: `http://${taskType}/stream` })
      );
    });

    it.each(ALL_TASK_TYPES)('%s throws when no URL is configured', (taskType) => {
      expect(() => createModalClientForTask(taskType)).toThrow();
    });
  });
});
