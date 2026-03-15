/**
 * Path Security Utilities
 * Provides path validation and sanitization to prevent security issues.
 *
 * Uses a blocklist approach: all paths are allowed unless they match
 * a known dangerous pattern (traversal, absolute, blocked directories/files).
 */

/**
 * Blocked directory prefixes — paths starting with these are rejected.
 */
const BLOCKED_DIR_PREFIXES = [
  'node_modules/',
  '.git/',
  '.github/',
  '__pycache__/',
];

/**
 * Blocked file/directory names — paths whose first segment matches
 * (exact or dot-extended, e.g. ".env", ".env.local", ".env.production").
 */
const BLOCKED_NAME_PREFIXES = ['.env'];

/**
 * Check if a path is blocked by the blocklist.
 * Returns an error message if blocked, null if allowed.
 */
function checkBlocklist(normalized: string): string | null {
  for (const prefix of BLOCKED_DIR_PREFIXES) {
    if (normalized.startsWith(prefix) || normalized.includes(`/${prefix}`)) {
      return `Path is blocked: ${prefix} paths are not allowed`;
    }
  }

  // Check the first path segment against blocked names
  const firstSegment = normalized.split('/')[0];
  for (const blocked of BLOCKED_NAME_PREFIXES) {
    if (firstSegment === blocked || firstSegment.startsWith(`${blocked}.`)) {
      return `Path is blocked: ${firstSegment} files are not allowed`;
    }
  }

  return null;
}

/**
 * Validate a path with detailed error message.
 * Returns null if valid, error message if invalid.
 */
export function validatePath(path: string): string | null {
  if (!path || typeof path !== 'string') {
    return 'Path must be a non-empty string';
  }

  const normalized = path.trim();

  if (normalized === '') {
    return 'Path cannot be empty';
  }

  if (normalized.includes('..')) {
    return 'Path traversal detected (..)';
  }

  if (normalized.startsWith('/')) {
    return 'Absolute paths are not allowed';
  }

  if (/^[A-Za-z]:/.test(normalized)) {
    return 'Windows absolute paths are not allowed';
  }

  if (/[<>:"|?*\x00-\x1f]/.test(normalized)) {
    return 'Path contains invalid characters';
  }

  return checkBlocklist(normalized);
}

/**
 * Check if a path is safe (no path traversal, no absolute paths, not blocked).
 * Returns true if the path is safe, false otherwise.
 */
export function isSafePath(path: string): boolean {
  return validatePath(path) === null;
}
