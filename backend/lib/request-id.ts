/**
 * Request ID Utility
 * Generates unique request correlation IDs for tracking requests through the system.
 */

import { randomBytes } from 'crypto';

/**
 * Generates a unique request ID for correlation across services
 * Format: req_<timestamp>_<random>
 * Example: req_1707849600000_a3f2d1c9
 */
export function generateRequestId(): string {
  const timestamp = Date.now();
  const random = randomBytes(4).toString('hex');
  return `req_${timestamp}_${random}`;
}

/**
 * Extracts timestamp from a request ID if it's in our format
 * Returns null if the format doesn't match
 */
export function extractRequestTimestamp(requestId: string): number | null {
  const match = requestId.match(/^req_(\d+)_[a-f0-9]+$/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/**
 * Validates that a string is a valid request ID format
 */
export function isValidRequestId(requestId: string): boolean {
  return /^req_\d+_[a-f0-9]{8}$/.test(requestId);
}
