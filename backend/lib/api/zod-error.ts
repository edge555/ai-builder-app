import { ZodError } from 'zod';

/**
 * Formats a ZodError into a human-readable string.
 * Returns a generic message for non-Zod errors.
 */
export function formatZodError(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
  }
  return 'Validation failed';
}
