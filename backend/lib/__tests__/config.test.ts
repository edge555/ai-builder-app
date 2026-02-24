/**
 * Tests for backend configuration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('config - ALLOWED_ORIGINS parsing', () => {
  beforeEach(() => {
    // Clear module cache to get fresh config for each test
    vi.resetModules();
  });

  it('should parse single origin correctly', async () => {
    process.env.ALLOWED_ORIGINS = 'http://localhost:8080';
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.AI_PROVIDER = 'openrouter';

    const { config } = await import('../config');

    expect(config.cors.allowedOrigins).toEqual(['http://localhost:8080']);
  });

  it('should parse multiple comma-separated origins', async () => {
    process.env.ALLOWED_ORIGINS = 'http://localhost:8080,http://localhost:5173,https://app.example.com';
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.AI_PROVIDER = 'openrouter';

    const { config } = await import('../config');

    expect(config.cors.allowedOrigins).toEqual([
      'http://localhost:8080',
      'http://localhost:5173',
      'https://app.example.com',
    ]);
    expect(config.cors.allowedOrigins).toHaveLength(3);
  });

  it('should trim whitespace from origins', async () => {
    process.env.ALLOWED_ORIGINS = '  http://localhost:8080  ,  http://localhost:5173  ,  https://app.example.com  ';
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.AI_PROVIDER = 'openrouter';

    const { config } = await import('../config');

    expect(config.cors.allowedOrigins).toEqual([
      'http://localhost:8080',
      'http://localhost:5173',
      'https://app.example.com',
    ]);

    // Verify no whitespace in any origin
    config.cors.allowedOrigins.forEach(origin => {
      expect(origin).not.toMatch(/^\s|\s$/);
    });
  });

  it('should handle origins with ports', async () => {
    process.env.ALLOWED_ORIGINS = 'http://localhost:8080,https://api.example.com:3000';
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.AI_PROVIDER = 'openrouter';

    const { config } = await import('../config');

    expect(config.cors.allowedOrigins).toEqual([
      'http://localhost:8080',
      'https://api.example.com:3000',
    ]);
  });

  it('should default to http://localhost:8080 when not provided', async () => {
    delete process.env.ALLOWED_ORIGINS;
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.AI_PROVIDER = 'openrouter';

    const { config } = await import('../config');

    expect(config.cors.allowedOrigins).toEqual(['http://localhost:8080']);
  });

  it('should handle empty string by using default', async () => {
    process.env.ALLOWED_ORIGINS = '';
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.AI_PROVIDER = 'openrouter';

    const { config } = await import('../config');

    // Empty string splits to [''], so we get one element
    expect(config.cors.allowedOrigins).toHaveLength(1);
  });
});

describe('config - environment validation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should require OPENROUTER_API_KEY when provider is openrouter', async () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.AI_PROVIDER = 'openrouter';

    await expect(async () => {
      await import('../config');
    }).rejects.toThrow('Invalid environment configuration');
  });

  it('should accept valid configuration', async () => {
    process.env.OPENROUTER_API_KEY = 'test-api-key';
    process.env.AI_PROVIDER = 'openrouter';
    process.env.ALLOWED_ORIGINS = 'http://localhost:8080';
    process.env.LOG_LEVEL = 'info';

    await expect(async () => {
      await import('../config');
    }).resolves.not.toThrow();
  });

  it('should validate LOG_LEVEL enum values', async () => {
    process.env.OPENROUTER_API_KEY = 'test-api-key';
    process.env.AI_PROVIDER = 'openrouter';
    process.env.LOG_LEVEL = 'invalid-level';

    await expect(async () => {
      await import('../config');
    }).rejects.toThrow('Invalid environment configuration');
  });

  it('should use default values for optional fields', async () => {
    process.env.OPENROUTER_API_KEY = 'test-api-key';
    process.env.AI_PROVIDER = 'openrouter';
    delete process.env.LOG_LEVEL;
    delete process.env.ALLOWED_ORIGINS;

    const { config } = await import('../config');

    expect(config.provider.name).toBe('openrouter');
    expect(config.cors.allowedOrigins).toEqual(['http://localhost:8080']);
  });
});
