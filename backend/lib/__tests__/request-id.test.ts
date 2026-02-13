/**
 * Tests for Request ID utility
 */

import { describe, it, expect } from 'vitest';
import { generateRequestId, extractRequestTimestamp, isValidRequestId } from '../request-id';

describe('generateRequestId', () => {
  it('should generate a request ID with correct format', () => {
    const requestId = generateRequestId();
    expect(requestId).toMatch(/^req_\d+_[a-f0-9]{8}$/);
  });

  it('should generate unique request IDs', () => {
    const id1 = generateRequestId();
    const id2 = generateRequestId();
    expect(id1).not.toBe(id2);
  });

  it('should include timestamp in request ID', () => {
    const beforeTimestamp = Date.now();
    const requestId = generateRequestId();
    const afterTimestamp = Date.now();

    const extractedTimestamp = extractRequestTimestamp(requestId);
    expect(extractedTimestamp).not.toBeNull();
    expect(extractedTimestamp!).toBeGreaterThanOrEqual(beforeTimestamp);
    expect(extractedTimestamp!).toBeLessThanOrEqual(afterTimestamp);
  });
});

describe('extractRequestTimestamp', () => {
  it('should extract timestamp from valid request ID', () => {
    const timestamp = 1707849600000;
    const requestId = `req_${timestamp}_a3f2d1c9`;
    const extracted = extractRequestTimestamp(requestId);
    expect(extracted).toBe(timestamp);
  });

  it('should return null for invalid format', () => {
    expect(extractRequestTimestamp('invalid')).toBeNull();
    expect(extractRequestTimestamp('req_notanumber_abc')).toBeNull();
    expect(extractRequestTimestamp('req_123')).toBeNull();
  });
});

describe('isValidRequestId', () => {
  it('should validate correct request ID format', () => {
    expect(isValidRequestId('req_1707849600000_a3f2d1c9')).toBe(true);
    expect(isValidRequestId('req_123456789_12345678')).toBe(true);
  });

  it('should reject invalid formats', () => {
    expect(isValidRequestId('invalid')).toBe(false);
    expect(isValidRequestId('req_abc_123')).toBe(false);
    expect(isValidRequestId('req_123_abc')).toBe(false); // not 8 hex chars
    expect(isValidRequestId('req_123_abcdefgh')).toBe(false); // not hex
    expect(isValidRequestId('req_123')).toBe(false);
    expect(isValidRequestId('')).toBe(false);
  });
});
