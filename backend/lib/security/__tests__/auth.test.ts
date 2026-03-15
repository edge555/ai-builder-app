import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifySupabaseToken } from '../auth';

// Pre-computed base64url-encoded payloads
// {"sub":"user-123","exp":9999999999}
const payload1 = 'eyJzdWIiOiJ1c2VyLTEyMyIsImV4cCI6OTk5OTk5OTk5OX0';
// {"sub":"user-456","exp":9999999999}
const payload2 = 'eyJzdWIiOiJ1c2VyLTQ1NiIsImV4cCI6OTk5OTk5OTk5OX0';
const validHeader = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
const fakeSignature = 'fakesig';

const mockSubtle = {
  importKey: vi.fn().mockResolvedValue('mock-key'),
  verify: vi.fn().mockResolvedValue(true),
};

describe('verifySupabaseToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubtle.verify.mockResolvedValue(true);
    vi.stubGlobal('crypto', { subtle: mockSubtle });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('happy path', () => {
    it('should verify valid token and return userId', async () => {
      const validToken = `${validHeader}.${payload1}.${fakeSignature}`;
      const result = await verifySupabaseToken(validToken, 'test-secret');

      expect(result).toEqual({ userId: 'user-123' });
    });

    it('should verify token with additional claims', async () => {
      const validToken = `${validHeader}.${payload2}.${fakeSignature}`;
      const result = await verifySupabaseToken(validToken, 'test-secret');

      expect(result).toEqual({ userId: 'user-456' });
    });
  });

  describe('edge cases', () => {
    it('should return null for token with wrong number of parts', async () => {
      const invalidToken = 'header.payload';
      const result = await verifySupabaseToken(invalidToken, 'test-secret');

      expect(result).toBeNull();
    });

    it('should return null for single part token', async () => {
      const invalidToken = 'header';
      const result = await verifySupabaseToken(invalidToken, 'test-secret');

      expect(result).toBeNull();
    });

    it('should return null for empty token', async () => {
      const result = await verifySupabaseToken('', 'test-secret');

      expect(result).toBeNull();
    });

    it('should return null for token with four parts', async () => {
      const invalidToken = 'header.payload.extra.signature';
      const result = await verifySupabaseToken(invalidToken, 'test-secret');

      expect(result).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should return null when signature verification fails', async () => {
      mockSubtle.verify.mockResolvedValue(false);
      const validToken = `${validHeader}.${payload1}.${fakeSignature}`;
      const result = await verifySupabaseToken(validToken, 'test-secret');

      expect(result).toBeNull();
    });

    it('should return null when token is expired', async () => {
      // {"sub":"user-123","exp":1} - expired
      const expiredPayload = 'eyJzdWIiOiJ1c2VyLTEyMyIsImV4cCI6MX0';
      const validToken = `${validHeader}.${expiredPayload}.${fakeSignature}`;
      const result = await verifySupabaseToken(validToken, 'test-secret');

      expect(result).toBeNull();
    });

    it('should return null when payload is missing sub claim', async () => {
      // {"exp":9999999999}
      const noSubPayload = 'eyJleHAiOjk5OTk5OTk5OTl9';
      const validToken = `${validHeader}.${noSubPayload}.${fakeSignature}`;
      const result = await verifySupabaseToken(validToken, 'test-secret');

      expect(result).toBeNull();
    });

    it('should return null when crypto operation throws', async () => {
      mockSubtle.verify.mockRejectedValue(new Error('Crypto error'));
      const validToken = `${validHeader}.${payload1}.${fakeSignature}`;
      const result = await verifySupabaseToken(validToken, 'test-secret');

      expect(result).toBeNull();
    });

    it('should return null when payload is invalid JSON', async () => {
      // "not-json" base64url encoded
      const invalidJsonPayload = 'bm90LWpzb24';
      const validToken = `${validHeader}.${invalidJsonPayload}.${fakeSignature}`;
      const result = await verifySupabaseToken(validToken, 'test-secret');

      expect(result).toBeNull();
    });
  });

  describe('return value shape', () => {
    it('should return object with userId property when successful', async () => {
      const validToken = `${validHeader}.${payload1}.${fakeSignature}`;
      const result = await verifySupabaseToken(validToken, 'test-secret');

      expect(result).toHaveProperty('userId');
      expect(typeof result?.userId).toBe('string');
    });

    it('should return null (not undefined) for failures', async () => {
      const result = await verifySupabaseToken('invalid', 'test-secret');

      expect(result).toBeNull();
    });
  });

  describe('side effects', () => {
    it('should not mutate input token', async () => {
      const validToken = `${validHeader}.${payload1}.${fakeSignature}`;
      const tokenCopy = validToken;

      await verifySupabaseToken(validToken, 'test-secret');

      expect(validToken).toBe(tokenCopy);
    });
  });
});
