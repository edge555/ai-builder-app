/**
 * Supabase JWT verification for Edge Runtime.
 * Uses Web Crypto API (no Node.js crypto dependency).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

        const valid = await crypto.subtle.verify('HMAC', key, signatureBytes as BufferSource, dataBytes as BufferSource);
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

/**
 * Checks that the request carries a valid Supabase JWT.
 * Returns `{ userId }` on success, or a 401/403 NextResponse on failure.
 *
 * When no JWT secret is configured (dev without Supabase), returns 403
 * with a message telling the operator to set SUPABASE_JWT_SECRET.
 */
export async function requireAuth(
    request: Request
): Promise<{ userId: string } | Response> {
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;
    if (!jwtSecret) {
        return new Response(
            JSON.stringify({ error: 'Auth not configured — set SUPABASE_JWT_SECRET to enable.', configured: false }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return new Response(
            JSON.stringify({ error: 'Missing or invalid Authorization header' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
    }

    const token = authHeader.slice(7);
    const result = await verifySupabaseToken(token, jwtSecret);

    if (!result) {
        return new Response(
            JSON.stringify({ error: 'Invalid or expired token' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
    }

    return result;
}

/**
 * Creates a Supabase client authenticated as the requesting user.
 * Passes the user's JWT in the Authorization header so Supabase RLS
 * enforces policies using auth.uid() — no manual ownership checks needed.
 *
 * Returns null if SUPABASE_URL or SUPABASE_ANON_KEY are not configured.
 */
export function createUserSupabaseClient(userToken: string): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!url || !anonKey) return null;

    return createClient(url, anonKey, {
        global: {
            headers: {
                Authorization: `Bearer ${userToken}`,
            },
        },
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });
}

/**
 * Creates a Supabase client using the service role key (bypasses RLS).
 * Use only for server-side admin operations where RLS cannot be applied,
 * e.g. reading org API keys on behalf of a verified member.
 *
 * Returns null if SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are not configured.
 */
export function createServiceRoleSupabaseClient(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return null;

    return createClient(url, serviceKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });
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
