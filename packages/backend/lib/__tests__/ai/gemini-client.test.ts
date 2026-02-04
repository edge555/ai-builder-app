import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiClient, createGeminiClient } from '../../ai';

describe('GeminiClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('throws when API key is missing', () => {
    expect(() => new GeminiClient({ apiKey: '' })).toThrow('Gemini API key is required');
  });

  it('creates a client with explicit config', () => {
    expect(
      () =>
        new GeminiClient({
          apiKey: 'test-api-key',
          model: 'gemini-pro',
          timeout: 5000,
          maxRetries: 1,
        })
    ).not.toThrow();
  });

  it('returns an error when the API responds with a failure', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: vi.fn().mockResolvedValue(
        JSON.stringify({ error: { message: 'Invalid key', code: 400 } })
      ),
      json: vi.fn(),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new GeminiClient({
      apiKey: 'test-api-key',
      timeout: 2000,
      maxRetries: 0,
    });

    const response = await client.generate({
      prompt: 'Hello, world!',
      temperature: 0.7,
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain('Gemini API error');
  });
});

describe('createGeminiClient', () => {
  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it('throws when GEMINI_API_KEY is not set', () => {
    expect(() => createGeminiClient()).toThrow('GEMINI_API_KEY environment variable is not set');
  });

  it('creates a client when GEMINI_API_KEY is set', () => {
    process.env.GEMINI_API_KEY = 'test-api-key';
    expect(() => createGeminiClient('gemini-pro')).not.toThrow();
  });
});
