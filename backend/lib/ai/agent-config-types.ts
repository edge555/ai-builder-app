/**
 * @module ai/agent-config-types
 * @description Type definitions for the per-task agent configuration system.
 * Defines the shape of the persisted agent config file (`data/agent-config.json`).
 *
 * TaskType determines which set of models is used for each AI operation:
 * - `intent` – prompt classification
 * - `planning` – file selection before modification
 * - `coding` – code generation and modification
 * - `debugging` – build-error fixing
 * - `documentation` – comment and doc generation
 */

export type TaskType = 'intent' | 'planning' | 'coding' | 'debugging' | 'documentation';

export interface ModelEntry {
  id: string;
  label?: string;
  active: boolean;
  priority: number;
}

export interface TaskConfig {
  taskType: TaskType;
  models: ModelEntry[];
}

export interface AgentConfig {
  version: 1;
  tasks: Record<TaskType, TaskConfig>;
}
