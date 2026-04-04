import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { encryptApiKey, decryptApiKey } from '../crypto';

// 32 random bytes base64-encoded for use as WORKSPACE_MASTER_KEY
const TEST_MASTER_KEY = Buffer.from(new Array(32).fill(1)).toString('base64');

describe('encryptApiKey / decryptApiKey', () => {
    beforeEach(() => {
        vi.stubEnv('WORKSPACE_MASTER_KEY', TEST_MASTER_KEY);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('round-trips an API key through encrypt → decrypt', async () => {
        const original = 'sk-test-abc123';
        const ciphertext = await encryptApiKey(original);
        const plaintext = await decryptApiKey(ciphertext);
        expect(plaintext).toBe(original);
    });

    it('produces different ciphertext each call (random IV)', async () => {
        const original = 'sk-test-abc123';
        const c1 = await encryptApiKey(original);
        const c2 = await encryptApiKey(original);
        expect(c1).not.toBe(c2);
    });

    it('round-trips an empty string', async () => {
        const ciphertext = await encryptApiKey('');
        const plaintext = await decryptApiKey(ciphertext);
        expect(plaintext).toBe('');
    });

    it('round-trips a long API key', async () => {
        const original = 'sk-' + 'x'.repeat(200);
        const ciphertext = await encryptApiKey(original);
        const plaintext = await decryptApiKey(ciphertext);
        expect(plaintext).toBe(original);
    });

    it('throws when WORKSPACE_MASTER_KEY is missing', async () => {
        vi.unstubAllEnvs();
        await expect(encryptApiKey('test')).rejects.toThrow('WORKSPACE_MASTER_KEY');
    });

    it('throws when WORKSPACE_MASTER_KEY is wrong length', async () => {
        vi.stubEnv('WORKSPACE_MASTER_KEY', Buffer.from('tooshort').toString('base64'));
        await expect(encryptApiKey('test')).rejects.toThrow('32 bytes');
    });

    it('throws when ciphertext is too short to contain an IV', async () => {
        const tooShort = Buffer.from('abc').toString('base64');
        await expect(decryptApiKey(tooShort)).rejects.toThrow('too short');
    });
});
