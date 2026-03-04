/**
 * Standardized error message templates.
 * Used across frontend and backend for consistent error formatting.
 */

/**
 * Input validation error.
 * Format: "Invalid [field]: [reason]. Expected: [expected]"
 */
export function validationError(field: string, reason: string, expected?: string): string {
  const base = `Invalid ${field}: ${reason}`;
  return expected ? `${base}. Expected: ${expected}` : base;
}

/**
 * Not found error.
 * Format: "[Resource] not found: [identifier]"
 */
export function notFoundError(resource: string, identifier: string): string {
  return `${resource} not found: ${identifier}`;
}

/**
 * Permission / access error.
 * Format: "Access denied to [resource]: [reason]"
 */
export function accessDeniedError(resource: string, reason: string): string {
  return `Access denied to ${resource}: ${reason}`;
}

/**
 * External API / service error.
 * Format: "[Service] request failed: [error message]"
 */
export function serviceError(service: string, errorMessage: string): string {
  return `${service} request failed: ${errorMessage}`;
}

/**
 * Configuration validation error (derived from validationError).
 * Format: "Invalid configuration: [reason]. Expected: [expected]"
 */
export function configError(reason: string, expected?: string): string {
  return validationError('configuration', reason, expected);
}

/**
 * Missing or invalid environment variable (derived from validationError).
 * Format: "Invalid [envVar]: not configured. Expected: [description]"
 */
export function envVarError(envVar: string, expected?: string): string {
  return validationError(envVar, 'not configured', expected);
}

/**
 * Internal state / runtime error.
 * Format: "[Component] state error: [reason]"
 */
export function stateError(component: string, reason: string): string {
  return `${component} state error: ${reason}`;
}
