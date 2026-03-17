/**
 * @module ai/modal-pipeline-factory
 * @description Factory for creating task-specific ModalClient instances.
 * Resolves per-task Modal endpoint env vars (MODAL_<TASK>_URL) and falls
 * back to MODAL_DEFAULT_URL. Throws if neither is set.
 *
 * URL resolution order per task:
 *   MODAL_<TASK>_URL → MODAL_DEFAULT_URL → throws
 *   MODAL_<TASK>_STREAM_URL → MODAL_DEFAULT_STREAM_URL → undefined (non-fatal)
 *
 * @requires ./agent-config-types - TaskType union
 * @requires ./modal-client - ModalClient class
 * @requires ../config - Resolved env vars
 * @requires @ai-app-builder/shared/utils - Error message helpers
 */

import type { TaskType } from './agent-config-types';
import { ModalClient } from './modal-client';
import { config } from '../config';
import { envVarError } from '@ai-app-builder/shared/utils';

interface TaskUrlKeys {
  urlKey: keyof typeof config.provider;
  streamUrlKey: keyof typeof config.provider;
}

const TASK_URL_KEYS: Record<TaskType, TaskUrlKeys> = {
  intent:    { urlKey: 'modalIntentUrl',    streamUrlKey: 'modalIntentStreamUrl'    },
  planning:  { urlKey: 'modalPlanningUrl',  streamUrlKey: 'modalPlanningStreamUrl'  },
  execution: { urlKey: 'modalExecutionUrl', streamUrlKey: 'modalExecutionStreamUrl' },
  bugfix:    { urlKey: 'modalBugfixUrl',    streamUrlKey: 'modalBugfixStreamUrl'    },
  review:    { urlKey: 'modalReviewUrl',    streamUrlKey: 'modalReviewStreamUrl'    },
};

/**
 * Creates a ModalClient for the given task type.
 *
 * Resolves the API URL from task-specific env var (e.g. MODAL_INTENT_URL),
 * falling back to MODAL_DEFAULT_URL. Throws if neither is set.
 *
 * Stream URL follows the same resolution order but is optional.
 */
export function createModalClientForTask(taskType: TaskType): ModalClient {
  const { urlKey, streamUrlKey } = TASK_URL_KEYS[taskType];

  const apiUrl =
    (config.provider[urlKey] as string | undefined) ??
    config.provider.modalDefaultUrl;

  if (!apiUrl) {
    throw new Error(
      envVarError(
        `MODAL_${taskType.toUpperCase()}_URL or MODAL_DEFAULT_URL`,
        `required for Modal provider (task: ${taskType})`
      )
    );
  }

  const streamApiUrl =
    (config.provider[streamUrlKey] as string | undefined) ??
    config.provider.modalDefaultStreamUrl;

  return new ModalClient({
    apiUrl,
    streamApiUrl,
    apiKey: config.provider.modalApiKey,
    timeout: process.env.MODAL_TIMEOUT
      ? parseInt(process.env.MODAL_TIMEOUT, 10)
      : undefined,
  });
}
