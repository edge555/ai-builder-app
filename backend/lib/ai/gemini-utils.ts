/**
 * Gemini API Utility Functions
 * Contains helper functions for logging and data sanitization.
 */

import { sanitizeError } from '@ai-app-builder/shared';

// Maximum length for payload logging before truncation
const MAX_LOG_PAYLOAD_LENGTH = 500;

/**
 * Sanitizes a URL by replacing the API key with a placeholder.
 * Ensures API keys are never exposed in logs.
 */
export function sanitizeUrl(url: string): string {
    return url.replace(/key=[^&]+/, 'key=[REDACTED]');
}

/**
 * Re-export sanitizeError from shared package for use across backend services.
 * Sanitizes error messages to prevent API key and sensitive data exposure.
 */
export { sanitizeError };

/**
 * Truncates a string payload for logging purposes.
 * Adds ellipsis indicator when truncated.
 */
export function truncatePayload(payload: string, maxLength: number = MAX_LOG_PAYLOAD_LENGTH): string {
    if (payload.length <= maxLength) {
        return payload;
    }
    return payload.substring(0, maxLength) + '...';
}
