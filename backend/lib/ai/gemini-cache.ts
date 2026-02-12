/**
 * Gemini API Cache Management
 * Handles caching of static system instructions using Gemini's cachedContent API.
 */

import { createHash } from 'crypto';
import { createLogger } from '../logger';
import { sanitizeUrl, truncatePayload } from './gemini-utils';

const logger = createLogger('gemini-cache');

/**
 * Manages Gemini cachedContent resources for static system instructions.
 * Uses an in-memory cache to avoid recreating content within TTL windows.
 */
export class GeminiCache {
    /** Local cache for Gemini cachedContent resources */
    private readonly cachedContentCache = new Map<
        string,
        {
            name: string;
            /** Local wall-clock expiry; Gemini TTL is enforced server-side */
            expiresAt: number;
        }
    >();

    /** TTL for cached contents (seconds). Gemini requires minimum of 300s (5 minutes). */
    private readonly cachedContentTtlSeconds = 300;

    constructor(
        private readonly baseUrl: string,
        private readonly apiKey: string,
        private readonly model: string,
        private readonly timeout: number
    ) { }

    /**
     * Compute a stable hash for static system instructions.
     */
    private hashStaticInstruction(staticInstruction: string): string {
        return createHash('sha256').update(staticInstruction).digest('hex');
    }

    /**
     * Create or retrieve a Gemini cachedContent resource for a static system instruction.
     * Uses an in-memory map keyed by model + hash(+optional cacheId) to avoid recreating
     * cached contents within the local TTL window.
     *
     * Returns the cachedContent resource name to be used in generateContent calls.
     */
    async getOrCreateCachedContent(
        staticInstruction: string,
        cacheId?: string
    ): Promise<string> {
        const hash = this.hashStaticInstruction(staticInstruction);
        const cacheKeyParts = [this.model, hash];
        if (cacheId) {
            cacheKeyParts.push(cacheId);
        }
        const cacheKey = cacheKeyParts.join(':');

        const now = Date.now();
        const existing = this.cachedContentCache.get(cacheKey);
        if (existing && existing.expiresAt > now) {
            return existing.name;
        }

        const url = `${this.baseUrl}/cachedContents?key=${this.apiKey}`;

        const body = {
            // For cachedContents, the model field expects the full resource name
            model: `models/${this.model}`,
            displayName: cacheId ?? `static-system-${hash.slice(0, 8)}`,
            contents: [
                {
                    role: 'user',
                    parts: [{ text: staticInstruction }],
                },
            ],
            ttl: `${this.cachedContentTtlSeconds}s`,
        };

        logger.debug('Creating Gemini cachedContent', {
            url: sanitizeUrl(url),
            model: this.model,
            displayName: body.displayName,
            staticInstructionLength: staticInstruction.length,
        });

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
                logger.error('Gemini cachedContent error response', {
                    status: response.status,
                    errorText: truncatePayload(errorText),
                });
                throw new Error(`Gemini cachedContent error: ${response.status} - ${errorText}`);
            }

            const data = (await response.json()) as { name?: string };

            if (!data.name) {
                logger.error('Gemini cachedContent response missing name', {
                    response: truncatePayload(JSON.stringify(data, null, 2)),
                });
                throw new Error('Gemini cachedContent response missing name');
            }

            const expiresAt = now + this.cachedContentTtlSeconds * 1000;
            this.cachedContentCache.set(cacheKey, { name: data.name, expiresAt });

            logger.info('Gemini cachedContent created', {
                name: data.name,
                cacheKey,
                ttlSeconds: this.cachedContentTtlSeconds,
            });

            return data.name;
        } catch (error) {
            clearTimeout(timeoutId);

            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`CachedContent request timeout after ${this.timeout}ms`);
            }

            logger.error('Gemini cachedContent exception', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }
}
