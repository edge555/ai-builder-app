import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { createLogger } from '../logger';
import type { AgentConfig, TaskType, ModelEntry } from './agent-config-types';

const logger = createLogger('agent-config-store');

const CONFIG_PATH = join(process.cwd(), 'data/agent-config.json');

const TASK_TYPES: TaskType[] = ['intent', 'planning', 'coding', 'debugging', 'documentation'];

function createDefaultConfig(): AgentConfig {
  const tasks = {} as AgentConfig['tasks'];
  for (const taskType of TASK_TYPES) {
    tasks[taskType] = { taskType, models: [] };
  }
  return { version: 1, tasks };
}

export async function load(): Promise<AgentConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as AgentConfig;
    // Ensure all task types exist (forward-compat if new types added)
    for (const taskType of TASK_TYPES) {
      if (!parsed.tasks[taskType]) {
        parsed.tasks[taskType] = { taskType, models: [] };
      }
    }
    logger.info('Agent config loaded from disk');
    return parsed;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      logger.info('No agent config found, using defaults');
      return createDefaultConfig();
    }
    logger.error('Failed to load agent config, using defaults', { error });
    return createDefaultConfig();
  }
}

export async function save(config: AgentConfig): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  logger.info('Agent config saved to disk');
}

export function getActiveModelsForTask(config: AgentConfig, taskType: TaskType): ModelEntry[] {
  const taskConfig = config.tasks[taskType];
  if (!taskConfig) return [];
  return taskConfig.models
    .filter((m) => m.active)
    .sort((a, b) => a.priority - b.priority);
}
