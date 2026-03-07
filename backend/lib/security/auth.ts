/**
 * Supabase JWT verification for Edge Runtime.
 * Uses Web Crypto API (no Node.js crypto dependency).
 */

interface JwtPayload {
    sub: string;
    exp: number;
    aud?: string;
    iss?: string;
    [key: string]: unknown;
}

/**
 * Verifies a Supabase JWT and extracts the userId (sub claim).
 * Returns null if the token is invalid or expired.
 */
export async function verifySupabaseToken(
    token: string,
    jwtSecret: string
): Promise<{ userId: string } | null> {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        const [headerB64, payloadB64, signatureB64] = parts;

        // Verify signature using HMAC-SHA256
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(jwtSecret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify']
        );

        const signatureBytes = base64UrlDecode(signatureB64);
        const dataBytes = encoder.encode(`${headerB64}.${payloadB64}`);

        const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, dataBytes);
        if (!valid) return null;

        // Decode payload
        const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
        const payload = JSON.parse(payloadJson) as JwtPayload;

        // Check expiration
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) return null;

        // Extract userId from sub claim
        if (!payload.sub) return null;

        return { userId: payload.sub };
    } catch {
        return null;
    }
}

function base64UrlDecode(str: string): Uint8Array {
    // Convert base64url to base64
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    // Pad with '='
    while (base64.length % 4 !== 0) {
        base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
