/**
 * Gemini API Utility Functions
 * Contains helper functions for logging and data sanitization.
 */

import { sanitizeError } from '@ai-app-builder/shared';

// Maximum length for payload logging before truncation
const MAX_LOG_PAYLOAD_LENGTH = 500;

/**
 * Sanitizes a URL for logging.
 * Since keys are passed via headers, this is now a passthrough but preserved for API compatibility.
 */
export function sanitizeUrl(url: string): string {
    // Keep redaction logic as a safety fallback in case a key is accidentally passed in URL
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
