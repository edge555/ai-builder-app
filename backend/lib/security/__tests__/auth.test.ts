import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifySupabaseToken, requireAuth } from '../auth';

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

  describe('ES256 path', () => {
    // ES256 header: {"alg":"ES256","kid":"test-kid"}
    const es256Header = 'eyJhbGciOiJFUzI1NiIsImtpZCI6InRlc3Qta2lkIn0';

    beforeEach(() => {
      // For ES256, importKey is called with jwk format, verify with ECDSA
      mockSubtle.importKey.mockResolvedValue('mock-ec-key');
      mockSubtle.verify.mockResolvedValue(true);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ keys: [{ kty: 'EC', crv: 'P-256', kid: 'test-kid' }] }),
      }));
      vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    });

    it('returns null when SUPABASE_URL is not set for ES256 tokens', async () => {
      vi.unstubAllEnvs();
      const token = `${es256Header}.${payload1}.${fakeSignature}`;
      const result = await verifySupabaseToken(token, 'test-secret');
      expect(result).toBeNull();
    });

    it('fetches JWKS and verifies ES256 token successfully', async () => {
      const token = `${es256Header}.${payload1}.${fakeSignature}`;
      const result = await verifySupabaseToken(token, 'test-secret');
      expect(result).toEqual({ userId: 'user-123' });
    });

    it('returns null when ES256 signature is invalid', async () => {
      mockSubtle.verify.mockResolvedValue(false);
      const token = `${es256Header}.${payload1}.${fakeSignature}`;
      const result = await verifySupabaseToken(token, 'test-secret');
      expect(result).toBeNull();
    });

    it('returns null when JWKS fetch throws', async () => {
      vi.stubEnv('SUPABASE_URL', 'https://different-project.supabase.co');
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
      const token = `${es256Header}.${payload1}.${fakeSignature}`;
      const result = await verifySupabaseToken(token, 'test-secret');
      expect(result).toBeNull();
    });
  });
});

describe('requireAuth', () => {
  const makeRequest = (headers: Record<string, string> = {}) =>
    new Request('https://example.com/api/test', { headers });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('trusts X-User-Id header set by middleware (bypasses JWT verification)', async () => {
    const request = makeRequest({ 'x-user-id': 'user-from-middleware' });
    const result = await requireAuth(request);
    expect(result).toEqual({ userId: 'user-from-middleware' });
  });

  it('returns 503 with CORS header when SUPABASE_JWT_SECRET is not configured', async () => {
    vi.unstubAllEnvs();
    const request = makeRequest({ 'origin': 'http://localhost:8080' });
    const result = await requireAuth(request);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(503);
    const corsHeader = (result as Response).headers.get('Access-Control-Allow-Origin');
    expect(corsHeader).toBeTruthy();
  });

  it('returns 401 with CORS header for missing Authorization header', async () => {
    vi.stubEnv('SUPABASE_JWT_SECRET', 'test-secret');
    const request = makeRequest({ 'origin': 'http://localhost:8080' });
    const result = await requireAuth(request);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    const corsHeader = (result as Response).headers.get('Access-Control-Allow-Origin');
    expect(corsHeader).toBeTruthy();
  });

  it('returns 401 with CORS header for invalid token', async () => {
    vi.stubEnv('SUPABASE_JWT_SECRET', 'test-secret');
    vi.stubGlobal('crypto', {
      subtle: {
        importKey: vi.fn().mockResolvedValue('mock-key'),
        verify: vi.fn().mockResolvedValue(false),
      },
    });
    const request = makeRequest({
      'authorization': 'Bearer invalid.token.here',
      'origin': 'http://localhost:8080',
    });
    const result = await requireAuth(request);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    const corsHeader = (result as Response).headers.get('Access-Control-Allow-Origin');
    expect(corsHeader).toBeTruthy();
  });
});
