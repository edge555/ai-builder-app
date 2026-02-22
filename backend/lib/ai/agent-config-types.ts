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
