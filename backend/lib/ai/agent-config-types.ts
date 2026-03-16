/**
 * @module ai/agent-config-types
 * @description Type definitions for the per-task agent configuration system.
 * Defines the shape of the persisted agent config file (`data/agent-config.json`).
 *
 * TaskType determines which set of models is used for each AI pipeline stage:
 * - `intent`    – classify and clarify the user request
 * - `planning`  – file structure and architecture planning
 * - `execution` – code generation and modification (streaming)
 * - `bugfix`    – build-error fixing
 * - `review`    – holistic code review after generation
 */

export type TaskType = 'intent' | 'planning' | 'execution' | 'bugfix' | 'review';

export interface ModelEntry {
  id: string;
  label?: string;
  active: boolean;
  priority: number;
}

export interface TaskConfig {
  taskType: TaskType;
  models: ModelEntry[];
  /** Set by the GET /agent-config handler when OPENROUTER_<TASK>_MODEL env var is explicitly set. Read-only; never persisted. */
  envOverride?: string;
}

export interface AgentConfig {
  version: 1;
  tasks: Record<TaskType, TaskConfig>;
}
