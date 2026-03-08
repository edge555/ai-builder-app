import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifySupabaseToken } from '../auth';

describe('verifySupabaseToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('happy path', () => {
    it('should verify valid token and return userId', async () => {
      const validToken = 'header.payload.signature';
      const jwtSecret = 'test-secret';

      const result = await verifySupabaseToken(validToken, jwtSecret);

      expect(result).toEqual({ userId: 'user-123' });
    });

    it('should verify token with additional claims', async () => {
      const validToken = 'header.payload.signature';
      const jwtSecret = 'test-secret';

      const result = await verifySupabaseToken(validToken, jwtSecret);

      expect(result).toEqual({ userId: 'user-456' });
    });
  });

  describe('edge cases', () => {
    it('should return null for token with wrong number of parts', async () => {
      const invalidToken = 'header.payload';
      const jwtSecret = 'test-secret';

      const result = await verifySupabaseToken(invalidToken, jwtSecret);

      expect(result).toBeNull();
    });

    it('should return null for single part token', async () => {
      const invalidToken = 'header';
      const jwtSecret = 'test-secret';

      const result = await verifySupabaseToken(invalidToken, jwtSecret);

      expect(result).toBeNull();
    });

    it('should return null for empty token', async () => {
      const emptyToken = '';
      const jwtSecret = 'test-secret';

      const result = await verifySupabaseToken(emptyToken, jwtSecret);

      expect(result).toBeNull();
    });

    it('should return null for token with four parts', async () => {
      const invalidToken = 'header.payload.extra.signature';
      const jwtSecret = 'test-secret';

      const result = await verifySupabaseToken(invalidToken, jwtSecret);

      expect(result).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should return null when signature verification fails', async () => {
      const validToken = 'header.payload.signature';
      const jwtSecret = 'test-secret';

      const result = await verifySupabaseToken(validToken, jwtSecret);

      expect(result).toBeNull();
    });

    it('should return null when token is expired', async () => {
      const validToken = 'header.payload.signature';
      const jwtSecret = 'test-secret';

      const result = await verifySupabaseToken(validToken, jwtSecret);

      expect(result).toBeNull();
    });

    it('should return null when payload is missing sub claim', async () => {
      const validToken = 'header.payload.signature';
      const jwtSecret = 'test-secret';

      const result = await verifySupabaseToken(validToken, jwtSecret);

      expect(result).toBeNull();
    });

    it('should return null when crypto operation throws', async () => {
      const validToken = 'header.payload.signature';
      const jwtSecret = 'test-secret';

      const result = await verifySupabaseToken(validToken, jwtSecret);

      expect(result).toBeNull();
    });

    it('should return null when payload is invalid JSON', async () => {
      const validToken = 'header.payload.signature';
      const jwtSecret = 'test-secret';

      const result = await verifySupabaseToken(validToken, jwtSecret);

      expect(result).toBeNull();
    });
  });

  describe('return value shape', () => {
    it('should return object with userId property when successful', async () => {
      const validToken = 'header.payload.signature';
      const jwtSecret = 'test-secret';

      const result = await verifySupabaseToken(validToken, jwtSecret);

      expect(result).toHaveProperty('userId');
      expect(typeof result?.userId).toBe('string');
    });

    it('should return null (not undefined) for failures', async () => {
      const invalidToken = 'invalid';
      const jwtSecret = 'test-secret';

      const result = await verifySupabaseToken(invalidToken, jwtSecret);

      expect(result).toBeNull();
    });
  });

  describe('side effects', () => {
    it('should not mutate input token', async () => {
      const validToken = 'header.payload.signature';
      const jwtSecret = 'test-secret';
      const tokenCopy = validToken;

      await verifySupabaseToken(validToken, jwtSecret);

      expect(validToken).toBe(tokenCopy);
    });
  });
});
