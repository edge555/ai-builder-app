/**
 * Gemini API Utility Functions
 * Contains helper functions for logging and data sanitization.
 */

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
 * Truncates a string payload for logging purposes.
 * Adds ellipsis indicator when truncated.
 */
export function truncatePayload(payload: string, maxLength: number = MAX_LOG_PAYLOAD_LENGTH): string {
    if (payload.length <= maxLength) {
        return payload;
    }
    return payload.substring(0, maxLength) + '...';
}
