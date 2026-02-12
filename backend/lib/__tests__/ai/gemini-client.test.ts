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

  it('should handle streaming responses', async () => {
    const mockChunks = [
      JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Hello ' }] } }] }),
      JSON.stringify({ candidates: [{ content: { parts: [{ text: 'world!' }] } }] }),
    ];

    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of mockChunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new GeminiClient({ apiKey: 'test-key' });
    const chunks: string[] = [];
    const response = await client.generateStreaming({
      prompt: 'test',
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(response.success).toBe(true);
    expect(response.content).toBe('Hello world!');
    expect(chunks).toEqual(['Hello ', 'world!']);
  });

  it('should retry on retryable errors', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: vi.fn().mockResolvedValue(JSON.stringify({ error: { message: 'Rate limit' } })),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ candidates: [{ content: { parts: [{ text: 'Success' }] } }] }),
      });
    vi.stubGlobal('fetch', mockFetch);

    const client = new GeminiClient({
      apiKey: 'test-key',
      maxRetries: 1,
      retryBaseDelay: 0, // No delay for tests
    });

    const response = await client.generate({ prompt: 'test' });

    expect(response.success).toBe(true);
    expect(response.content).toBe('Success');
    expect(response.retryCount).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should not retry on non-retryable errors', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: vi.fn().mockResolvedValue(JSON.stringify({ error: { message: 'Bad request' } })),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new GeminiClient({
      apiKey: 'test-key',
      maxRetries: 3,
      retryBaseDelay: 0,
    });

    const response = await client.generate({ prompt: 'test' });

    expect(response.success).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
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
