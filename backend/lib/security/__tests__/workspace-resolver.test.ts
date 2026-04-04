import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractBearerToken } from '../workspace-resolver';

// extractBearerToken is a pure function — test it directly.
// resolveWorkspaceProvider requires Supabase + crypto, covered by integration tests.

describe('extractBearerToken', () => {
    it('returns the token from a valid Bearer header', () => {
        const token = extractBearerToken('Bearer eyJhbGci.test.sig');
        expect(token).toBe('eyJhbGci.test.sig');
    });

    it('returns null for null input', () => {
        expect(extractBearerToken(null)).toBeNull();
    });

    it('returns null when header does not start with Bearer', () => {
        expect(extractBearerToken('Token abc123')).toBeNull();
        expect(extractBearerToken('Basic abc123')).toBeNull();
        expect(extractBearerToken('abc123')).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(extractBearerToken('')).toBeNull();
    });

    it('preserves the full token including dots and special chars', () => {
        const fullToken = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig-with-dashes_and_underscores';
        expect(extractBearerToken(`Bearer ${fullToken}`)).toBe(fullToken);
    });
});
