/**
 * Shared error handling utilities
 */

/**
 * Sanitizes error messages to prevent API key exposure.
 */
export function sanitizeError(message: string): string {
  return message
    .replace(/key=[^&\s"']+/gi, 'key=REDACTED')
    .replace(/apikey=[^&\s"']+/gi, 'apikey=REDACTED')
    .replace(/token=[^&\s"']+/gi, 'token=REDACTED')
    .replace(/secret=[^&\s"']+/gi, 'secret=REDACTED')
    .replace(/password=[^&\s"']+/gi, 'password=REDACTED')
    .replace(/SUPABASE_SERVICE_ROLE_KEY[^&\s"']*/gi, 'SUPABASE_SERVICE_ROLE_KEY=REDACTED')
    .replace(/GEMINI_API_KEY[^&\s"']*/gi, 'GEMINI_API_KEY=REDACTED');
}
