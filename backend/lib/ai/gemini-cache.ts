/**
 * Gemini API Cache Management
 * Handles caching of static system instructions using Gemini's cachedContent API.
 */

import { createHash } from 'crypto';
import { createLogger } from '../logger';
import { sanitizeUrl, truncatePayload } from './gemini-utils';

const logger = createLogger('gemini-cache');

interface CacheEntry {
    name: string;
    /** Local wall-clock expiry; Gemini TTL is enforced server-side */
    expiresAt: number;
    /** Last access timestamp for LRU eviction */
    lastAccessedAt: number;
}

interface CacheStats {
    hits: number;
    misses: number;
    evictions: number;
    expiryCleanups: number;
}

/**
 * Manages Gemini cachedContent resources for static system instructions.
 * Uses an in-memory cache to avoid recreating content within TTL windows.
 * Implements automatic expiry cleanup, LRU eviction, and cache statistics.
 */
export class GeminiCache {
    /** Local cache for Gemini cachedContent resources */
    private readonly cachedContentCache = new Map<string, CacheEntry>();

    /** TTL for cached contents (seconds). Gemini requires minimum of 300s (5 minutes). */
    private readonly cachedContentTtlSeconds = 300;

    /** Maximum number of entries in cache before LRU eviction */
    private readonly maxSize = 100;

    /** Cache statistics for monitoring */
    private stats: CacheStats = {
        hits: 0,
        misses: 0,
        evictions: 0,
        expiryCleanups: 0,
    };

    /** Interval timer for periodic cleanup */
    private cleanupTimer?: NodeJS.Timeout;

    constructor(
        private readonly baseUrl: string,
        private readonly apiKey: string,
        private readonly model: string,
        private readonly timeout: number
    ) {
        // Start periodic cleanup every 5 minutes
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, 5 * 60 * 1000);
    }

    /**
     * Cleanup method to be called when the cache is no longer needed.
     * Stops the periodic cleanup timer.
     */
    destroy(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }
    }

    /**
     * Compute a stable hash for static system instructions.
     */
    private hashStaticInstruction(staticInstruction: string): string {
        return createHash('sha256').update(staticInstruction).digest('hex');
    }

    /**
     * Remove expired entries from the cache.
     * Called periodically and on every get operation (lazy cleanup).
     */
    private cleanup(): void {
        const now = Date.now();
        let removedCount = 0;
        const keysToRemove: string[] = [];

        this.cachedContentCache.forEach((entry, key) => {
            if (entry.expiresAt < now) {
                keysToRemove.push(key);
            }
        });

        keysToRemove.forEach(key => {
            this.cachedContentCache.delete(key);
            removedCount++;
        });

        if (removedCount > 0) {
            this.stats.expiryCleanups += removedCount;
            logger.debug('Cleaned up expired cache entries', {
                removedCount,
                remainingCount: this.cachedContentCache.size,
                totalExpiryCleanups: this.stats.expiryCleanups,
            });
        }
    }

    /**
     * Evict least recently used entries when cache exceeds maxSize.
     */
    private evictLRU(): void {
        if (this.cachedContentCache.size <= this.maxSize) {
            return;
        }

        // Collect all entries and sort by lastAccessedAt (oldest first)
        const entries: Array<[string, CacheEntry]> = [];
        this.cachedContentCache.forEach((entry, key) => {
            entries.push([key, entry]);
        });

        entries.sort(([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt);

        // Remove oldest entries until we're under maxSize
        const toRemove = this.cachedContentCache.size - this.maxSize;
        for (let i = 0; i < toRemove; i++) {
            const [key] = entries[i];
            this.cachedContentCache.delete(key);
            this.stats.evictions++;
        }

        logger.debug('Evicted LRU cache entries', {
            evictedCount: toRemove,
            newSize: this.cachedContentCache.size,
            totalEvictions: this.stats.evictions,
        });
    }

    /**
     * Get current cache statistics for monitoring.
     */
    getStats(): CacheStats & { size: number; hitRate: number } {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? this.stats.hits / total : 0;

        return {
            ...this.stats,
            size: this.cachedContentCache.size,
            hitRate,
        };
    }

    /**
     * Log current cache statistics.
     */
    private logStats(): void {
        const stats = this.getStats();
        logger.info('Cache statistics', {
            size: stats.size,
            hits: stats.hits,
            misses: stats.misses,
            hitRate: `${(stats.hitRate * 100).toFixed(2)}%`,
            evictions: stats.evictions,
            expiryCleanups: stats.expiryCleanups,
        });
    }

    /**
     * Clear all cache entries and reset statistics.
     * Useful for testing and manual cleanup.
     */
    clear(): void {
        const previousSize = this.cachedContentCache.size;
        this.cachedContentCache.clear();
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            expiryCleanups: 0,
        };

        logger.info('Cache cleared', { previousSize });
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
        // Lazy cleanup on every get operation
        this.cleanup();

        const hash = this.hashStaticInstruction(staticInstruction);
        const cacheKeyParts = [this.model, hash];
        if (cacheId) {
            cacheKeyParts.push(cacheId);
        }
        const cacheKey = cacheKeyParts.join(':');

        const now = Date.now();
        const existing = this.cachedContentCache.get(cacheKey);
        if (existing && existing.expiresAt > now) {
            // Cache hit - update access time and stats
            existing.lastAccessedAt = now;
            this.stats.hits++;

            logger.debug('Cache hit', {
                cacheKey,
                name: existing.name,
                hitRate: `${(this.getStats().hitRate * 100).toFixed(2)}%`,
            });

            return existing.name;
        }

        // Cache miss
        this.stats.misses++;
        logger.debug('Cache miss', {
            cacheKey,
            expired: existing ? true : false,
        });

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
            this.cachedContentCache.set(cacheKey, {
                name: data.name,
                expiresAt,
                lastAccessedAt: now,
            });

            // Evict LRU entries if cache exceeds maxSize
            this.evictLRU();

            logger.info('Gemini cachedContent created', {
                name: data.name,
                cacheKey,
                ttlSeconds: this.cachedContentTtlSeconds,
                cacheSize: this.cachedContentCache.size,
            });

            // Log stats periodically (every 10th cache operation)
            if ((this.stats.hits + this.stats.misses) % 10 === 0) {
                this.logStats();
            }

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
