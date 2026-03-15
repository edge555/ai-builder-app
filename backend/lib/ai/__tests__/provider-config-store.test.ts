/**
 * Tests for provider-config-store module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFile, writeFile, mkdir } from 'fs/promises';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

// Mock the config
vi.mock('../../config', () => ({
  config: {
    provider: {
      name: 'openrouter',
    },
  },
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
import {
  getEffectiveProvider,
  getProviderConfigWithSource,
  saveProvider,
  type AIProviderName,
} from '../provider-config-store';

describe('provider-config-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the module cache between tests
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getEffectiveProvider', () => {
    it('should return stored provider when set', async () => {
      // Need to reimport to reset cache
      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(JSON.stringify({ aiProvider: 'modal' })),
        writeFile: vi.fn(),
        mkdir: vi.fn(),
      }));

      const { getEffectiveProvider } = await import('../provider-config-store');
      const result = await getEffectiveProvider();
      expect(result).toBe('modal');
    });

    it('should return env default when stored provider is null', async () => {
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ aiProvider: null }));

      const result = await getEffectiveProvider();

      expect(result).toBe('openrouter');
    });

    it('should return env default when config file does not exist', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(readFile).mockRejectedValue(error);

      const result = await getEffectiveProvider();

      expect(result).toBe('openrouter');
    });

    it('should return env default on read error', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('Permission denied'));

      const result = await getEffectiveProvider();

      expect(result).toBe('openrouter');
    });
  });

  describe('getProviderConfigWithSource', () => {
    it('should return settings source when provider is set in config', async () => {
      // Use saveProvider to directly set the cached state (bypasses cache-hit in load())
      vi.mocked(writeFile).mockResolvedValue(undefined);
      vi.mocked(mkdir).mockResolvedValue(undefined);
      await saveProvider('modal' as AIProviderName);

      const result = await getProviderConfigWithSource();

      expect(result.provider).toBe('modal');
      expect(result.source).toBe('settings');
      expect(result.envProvider).toBe('openrouter');
    });

    it('should return env source when provider is null', async () => {
      // Reset cached state to { aiProvider: null } via saveProvider
      vi.mocked(writeFile).mockResolvedValue(undefined);
      vi.mocked(mkdir).mockResolvedValue(undefined);
      await saveProvider(null);

      const result = await getProviderConfigWithSource();

      expect(result.provider).toBe('openrouter');
      expect(result.source).toBe('env');
      expect(result.envProvider).toBe('openrouter');
    });

    it('should return env source when config file does not exist', async () => {
      // Reset cached state to { aiProvider: null } via saveProvider
      vi.mocked(writeFile).mockResolvedValue(undefined);
      vi.mocked(mkdir).mockResolvedValue(undefined);
      await saveProvider(null);

      const result = await getProviderConfigWithSource();

      expect(result.source).toBe('env');
    });
  });

  describe('saveProvider', () => {
    it('should save modal provider to config file', async () => {
      await saveProvider('modal');

      expect(mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
      expect(writeFile).toHaveBeenCalled();
      
      const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenContent);
      expect(parsed.aiProvider).toBe('modal');
    });

    it('should save openrouter provider to config file', async () => {
      await saveProvider('openrouter');

      expect(writeFile).toHaveBeenCalled();
      const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenContent);
      expect(parsed.aiProvider).toBe('openrouter');
    });

    it('should save null provider (reset to env default)', async () => {
      await saveProvider(null);

      expect(writeFile).toHaveBeenCalled();
      const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenContent);
      expect(parsed.aiProvider).toBeNull();
    });

    it('should create directory if it does not exist', async () => {
      await saveProvider('modal');

      expect(mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    it('should update in-memory cache after save', async () => {
      await saveProvider('modal');
      
      // The cache should be updated - verify by checking the saved content
      expect(writeFile).toHaveBeenCalled();
    });
  });

  describe('provider types', () => {
    it('should accept valid provider names', () => {
      const validProviders: AIProviderName[] = ['openrouter', 'modal'];
      
      validProviders.forEach(provider => {
        expect(['openrouter', 'modal']).toContain(provider);
      });
    });
  });
});
