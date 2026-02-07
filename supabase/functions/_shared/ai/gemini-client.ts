/**
 * Gemini API Client for Supabase Edge Functions
 * Deno-compatible client for Google's Gemini API with streaming support.
 */

import { getAIConfig, type AIConfig } from './config.ts';

export interface GeminiRequest {
    /** The prompt to send to Gemini */
    prompt: string;
    /** System instruction for the model */
    systemInstruction?: string;
    /** Temperature for response generation (0-1) */
    temperature?: number;
    /** Maximum tokens in response */
    maxOutputTokens?: number;
    /** JSON schema for structured output */
    responseSchema?: object;
}

export interface GeminiStreamingRequest extends GeminiRequest {
    /** Callback for each chunk of streamed content */
    onChunk?: (chunk: string, accumulatedLength: number) => void;
}

export interface GeminiResponse {
    /** Whether the request was successful */
    success: boolean;
    /** The generated text content */
    content?: string;
    /** Error message if unsuccessful */
    error?: string;
    /** Number of retry attempts made */
    retryCount?: number;
}

interface GeminiAPIResponse {
    candidates?: Array<{
        content?: {
            parts?: Array<{
                text?: string;
            }>;
        };
        finishReason?: string;
    }>;
    error?: {
        message: string;
        code: number;
    };
}

/**
 * Sanitizes a URL by replacing the API key with a placeholder.
 */
function sanitizeUrl(url: string): string {
    return url.replace(/key=[^&]+/, 'key=[REDACTED]');
}

/**
 * Client for interacting with Google's Gemini API.
 * Implements timeout and retry logic with exponential backoff.
 */
export class GeminiClient {
    private readonly apiKey: string;
    private readonly model: string;
    private readonly timeout: number;
    private readonly maxRetries: number;
    private readonly retryBaseDelay: number;
    private readonly maxOutputTokens: number;
    private readonly temperature: number;
    private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

    constructor(config?: Partial<AIConfig>) {
        const fullConfig = config ? { ...getAIConfig(), ...config } : getAIConfig();
        this.apiKey = fullConfig.apiKey;
        this.model = fullConfig.model;
        this.timeout = fullConfig.timeout;
        this.maxRetries = fullConfig.maxRetries;
        this.retryBaseDelay = fullConfig.retryBaseDelay;
        this.maxOutputTokens = fullConfig.maxOutputTokens;
        this.temperature = fullConfig.temperature;
    }

    /**
     * Sends a request to the Gemini API with retry logic.
     */
    async generate(request: GeminiRequest): Promise<GeminiResponse> {
        let lastError: Error | null = null;
        let retryCount = 0;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await this.makeRequest(request);
                return {
                    success: true,
                    content: response,
                    retryCount,
                };
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                retryCount = attempt;

                if (!this.isRetryableError(lastError)) {
                    break;
                }

                if (attempt < this.maxRetries) {
                    await this.delay(this.calculateBackoff(attempt));
                }
            }
        }

        return {
            success: false,
            error: lastError?.message ?? 'Unknown error occurred',
            retryCount,
        };
    }

    /**
     * Sends a streaming request to the Gemini API.
     */
    async generateStreaming(request: GeminiStreamingRequest): Promise<GeminiResponse> {
        let lastError: Error | null = null;
        let retryCount = 0;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await this.makeStreamingRequest(request);
                return {
                    success: true,
                    content: response,
                    retryCount,
                };
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                retryCount = attempt;

                if (!this.isRetryableError(lastError)) {
                    break;
                }

                if (attempt < this.maxRetries) {
                    await this.delay(this.calculateBackoff(attempt));
                }
            }
        }

        return {
            success: false,
            error: lastError?.message ?? 'Unknown error occurred',
            retryCount,
        };
    }

    /**
     * Makes a streaming request to the Gemini API.
     */
    private async makeStreamingRequest(request: GeminiStreamingRequest): Promise<string> {
        // Use alt=sse for proper Server-Sent Events format
        const url = `${this.baseUrl}/models/${this.model}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

        const body = {
            contents: [
                {
                    parts: [{ text: request.prompt }],
                },
            ],
            generationConfig: {
                temperature: request.temperature ?? this.temperature,
                maxOutputTokens: request.maxOutputTokens ?? this.maxOutputTokens,
                ...(request.responseSchema && {
                    responseMimeType: 'application/json',
                    responseSchema: request.responseSchema,
                }),
            },
            ...(request.systemInstruction && {
                systemInstruction: {
                    parts: [{ text: request.systemInstruction }],
                },
            }),
        };

        console.log('[GeminiClient] Streaming request to', sanitizeUrl(url));

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            if (!response.ok) {
                clearTimeout(timeoutId);
                const errorText = await response.text();
                console.error('[GeminiClient] Error response:', response.status, errorText.substring(0, 500));
                throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                clearTimeout(timeoutId);
                throw new Error('No response body for streaming');
            }

            const decoder = new TextDecoder();
            let accumulated = '';
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Parse SSE format: lines starting with "data: " contain JSON
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep last incomplete line

                for (const line of lines) {
                    const trimmed = line.trim();

                    // Skip empty lines and comments
                    if (!trimmed || trimmed.startsWith(':')) continue;

                    // Parse SSE data lines
                    if (trimmed.startsWith('data: ')) {
                        const jsonStr = trimmed.slice(6); // Remove 'data: ' prefix

                        try {
                            const data = JSON.parse(jsonStr) as GeminiAPIResponse;
                            const chunk = data.candidates?.[0]?.content?.parts?.[0]?.text;

                            if (chunk) {
                                accumulated += chunk;
                                request.onChunk?.(chunk, accumulated.length);
                            }
                        } catch {
                            // Skip invalid JSON
                            console.log('[GeminiClient] Skipping non-JSON SSE data');
                        }
                    }
                }
            }

            clearTimeout(timeoutId);

            if (!accumulated) {
                throw new Error('No content in streaming response');
            }

            console.log('[GeminiClient] Streaming completed, content length:', accumulated.length);
            return accumulated;
        } catch (error) {
            clearTimeout(timeoutId);

            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`Request timeout after ${this.timeout}ms`);
            }

            throw error;
        }
    }

    /**
     * Makes a single request to the Gemini API.
     */
    private async makeRequest(request: GeminiRequest): Promise<string> {
        const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

        const body = {
            contents: [
                {
                    parts: [{ text: request.prompt }],
                },
            ],
            generationConfig: {
                temperature: request.temperature ?? this.temperature,
                maxOutputTokens: request.maxOutputTokens ?? this.maxOutputTokens,
                ...(request.responseSchema && {
                    responseMimeType: 'application/json',
                    responseSchema: request.responseSchema,
                }),
            },
            ...(request.systemInstruction && {
                systemInstruction: {
                    parts: [{ text: request.systemInstruction }],
                },
            }),
        };

        console.log('[GeminiClient] Request to', sanitizeUrl(url));

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = response.statusText;
                try {
                    const errorData = JSON.parse(errorText) as GeminiAPIResponse;
                    errorMessage = errorData.error?.message ?? response.statusText;
                } catch {
                    // Use statusText
                }
                throw new Error(`Gemini API error: ${response.status} - ${errorMessage}`);
            }

            const data = (await response.json()) as GeminiAPIResponse;
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!content) {
                throw new Error('No content in Gemini response');
            }

            console.log('[GeminiClient] Request completed, content length:', content.length);
            return content;
        } catch (error) {
            clearTimeout(timeoutId);

            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`Request timeout after ${this.timeout}ms`);
            }

            throw error;
        }
    }

    /**
     * Determines if an error is retryable.
     */
    private isRetryableError(error: Error): boolean {
        const message = error.message.toLowerCase();

        // NEVER retry on timeout
        if (message.includes('timeout')) {
            return false;
        }

        // Retry on rate limiting and server errors
        return (
            message.includes('rate limit') ||
            message.includes('429') ||
            message.includes('500') ||
            message.includes('502') ||
            message.includes('503') ||
            message.includes('504')
        );
    }

    /**
     * Calculates exponential backoff delay.
     */
    private calculateBackoff(attempt: number): number {
        const exponentialDelay = this.retryBaseDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 0.3 * exponentialDelay;
        return exponentialDelay + jitter;
    }

    /**
     * Delays execution for the specified duration.
     */
    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

/**
 * Creates a GeminiClient instance.
 */
export function createGeminiClient(): GeminiClient {
    return new GeminiClient();
}
