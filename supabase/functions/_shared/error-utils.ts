/**
 * Shared error handling utilities for Supabase Edge Functions
 *
 * This module now delegates to the shared package for common error utilities.
 */

import { sanitizeError as sharedSanitizeError } from "../../../shared/src/utils/error-utils.ts";

/**
 * Re-export sanitizeError from shared package for backward compatibility.
 * Sanitizes error messages to prevent API key and sensitive data exposure.
 */
export const sanitizeError = sharedSanitizeError;
