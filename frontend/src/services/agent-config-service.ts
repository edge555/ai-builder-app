import { FUNCTIONS_BASE_URL } from '@/integrations/backend/client';

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

export async function fetchAgentConfig(): Promise<AgentConfig> {
  const response = await fetch(`${FUNCTIONS_BASE_URL}/agent-config`);
  if (!response.ok) {
    throw new Error(`Failed to fetch agent config: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<AgentConfig>;
}

export async function saveAgentConfig(config: AgentConfig): Promise<AgentConfig> {
  const response = await fetch(`${FUNCTIONS_BASE_URL}/agent-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    throw new Error(`Failed to save agent config: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<AgentConfig>;
}
