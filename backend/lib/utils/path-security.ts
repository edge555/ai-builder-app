/**
 * Path Security Utilities
 * Provides path validation and sanitization to prevent security issues.
 */

/**
 * Check if a path is safe (no path traversal, no absolute paths).
 * Returns true if the path is safe, false otherwise.
 */
export function isSafePath(path: string): boolean {
  if (!path || typeof path !== 'string') {
    return false;
  }

  // Normalize the path
  const normalized = path.trim();

  // Check for empty path
  if (normalized === '') {
    return false;
  }

  // Check for path traversal patterns
  if (normalized.includes('..')) {
    return false;
  }

  // Check for absolute paths (Unix)
  if (normalized.startsWith('/')) {
    return false;
  }

  // Check for absolute paths (Windows)
  if (/^[A-Za-z]:/.test(normalized)) {
    return false;
  }

  // Check for invalid characters
  if (/[<>:"|?*\x00-\x1f]/.test(normalized)) {
    return false;
  }

  // Path must start with a valid prefix (src/ or public/ or frontend/)
  const validPrefixes = ['src/', 'public/', 'frontend/', 'app/'];
  const hasValidPrefix = validPrefixes.some(prefix => normalized.startsWith(prefix));
  
  if (!hasValidPrefix) {
    return false;
  }

  return true;
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

  const validPrefixes = ['src/', 'public/', 'frontend/', 'app/'];
  const hasValidPrefix = validPrefixes.some(prefix => normalized.startsWith(prefix));
  
  if (!hasValidPrefix) {
    return `Path must start with one of: ${validPrefixes.join(', ')}`;
  }

  return null;
}
