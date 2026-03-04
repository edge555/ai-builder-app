import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { createLogger } from '../logger';
import { config } from '../config';

const logger = createLogger('provider-config-store');

const CONFIG_PATH = join(process.cwd(), 'data/provider-config.json');

export type AIProviderName = 'openrouter' | 'modal';

export interface ProviderConfig {
  aiProvider: AIProviderName | null; // null = use env default
}

export interface ProviderConfigWithSource {
  provider: AIProviderName;
  source: 'settings' | 'env';
  envProvider: AIProviderName;
}

let cached: ProviderConfig | null = null;

async function load(): Promise<ProviderConfig> {
  if (cached !== null) return cached;
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    cached = JSON.parse(raw) as ProviderConfig;
    return cached;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      cached = { aiProvider: null };
      return cached;
    }
    logger.error('Failed to load provider config, using env default', { error });
    cached = { aiProvider: null };
    return cached;
  }
}

export async function getEffectiveProvider(): Promise<AIProviderName> {
  const stored = await load();
  return stored.aiProvider ?? config.provider.name;
}

export async function getProviderConfigWithSource(): Promise<ProviderConfigWithSource> {
  const stored = await load();
  const envProvider = config.provider.name;
  if (stored.aiProvider !== null) {
    return { provider: stored.aiProvider, source: 'settings', envProvider };
  }
  return { provider: envProvider, source: 'env', envProvider };
}

export async function saveProvider(aiProvider: AIProviderName | null): Promise<void> {
  const newConfig: ProviderConfig = { aiProvider };
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf-8');
  cached = newConfig; // Update in-memory cache immediately
  logger.info('Provider config saved', { aiProvider: aiProvider ?? 'env-default' });
}
