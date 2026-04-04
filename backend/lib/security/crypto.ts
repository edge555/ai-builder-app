/**
 * AES-256-GCM encryption/decryption for workspace API keys.
 *
 * Key: WORKSPACE_MASTER_KEY env var — base64-encoded 32 random bytes.
 * IV: random 12 bytes prepended to the ciphertext (not deterministic).
 * Format: base64(iv_12_bytes || ciphertext || auth_tag_16_bytes)
 *
 * Uses Web Crypto API (Edge Runtime compatible, no Node.js crypto).
 */

const IV_LENGTH = 12;   // GCM recommended IV size
const TAG_LENGTH = 128; // GCM auth tag length in bits

/**
 * Imports the master key from the WORKSPACE_MASTER_KEY env var.
 * Throws if the env var is missing or not 32 bytes when decoded.
 */
async function getMasterKey(): Promise<CryptoKey> {
    const raw = process.env.WORKSPACE_MASTER_KEY;
    if (!raw) {
        throw new Error('WORKSPACE_MASTER_KEY env var is not set');
    }

    const keyBytes = Buffer.from(raw, 'base64');
    if (keyBytes.length !== 32) {
        throw new Error(`WORKSPACE_MASTER_KEY must be 32 bytes when base64-decoded (got ${keyBytes.length})`);
    }

    return crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypts an API key string.
 * Returns a base64 string: iv (12 bytes) || ciphertext+tag.
 */
export async function encryptApiKey(plaintext: string): Promise<string> {
    const key = await getMasterKey();
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encodedText = new TextEncoder().encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, tagLength: TAG_LENGTH },
        key,
        encodedText
    );

    // Prepend IV to ciphertext
    const result = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(ciphertext), IV_LENGTH);

    return Buffer.from(result).toString('base64');
}

/**
 * Decrypts an API key string previously encrypted by encryptApiKey.
 * Returns the plaintext API key, or throws on tampered/invalid data.
 */
export async function decryptApiKey(encrypted: string): Promise<string> {
    const key = await getMasterKey();
    const data = Buffer.from(encrypted, 'base64');

    if (data.length <= IV_LENGTH) {
        throw new Error('Encrypted API key is too short to contain an IV');
    }

    const iv = data.subarray(0, IV_LENGTH);
    const ciphertext = data.subarray(IV_LENGTH);

    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, tagLength: TAG_LENGTH },
        key,
        ciphertext
    );

    return new TextDecoder().decode(plaintext);
}
