/**
 * Next.js Proxy (formerly middleware) — Security Headers + JWT Auth
 *
 * Runs on all /api/* routes in the Edge Runtime.
 * Adds security headers and verifies Supabase JWT on protected routes.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySupabaseToken } from './lib/security/auth';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

/** Routes that always remain public. */
const PUBLIC_PATHS = ['/api/health'];

function requiresProxyAuth(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();

  if (PUBLIC_PATHS.some((path) => pathname === path)) {
    return false;
  }

  // Generation, modification, uploads, export, diff, revert, and version listing
  // are public routes in local/dev mode. Workspace-scoped auth is enforced inside
  // the route handlers when a workspace identity is provided.
  if (
    pathname === '/api/generate' ||
    pathname === '/api/generate-stream' ||
    pathname === '/api/modify' ||
    pathname === '/api/modify-stream' ||
    pathname === '/api/upload' ||
    pathname === '/api/export' ||
    pathname === '/api/diff' ||
    pathname === '/api/revert' ||
    pathname === '/api/versions'
  ) {
    return false;
  }

  // Read-only config endpoints are public; mutations are protected.
  if ((pathname === '/api/agent-config' || pathname === '/api/provider-config') && method !== 'PUT') {
    return false;
  }

  // Invite lookup is public; accepting an invite requires auth.
  if (pathname.startsWith('/api/invite/') && method === 'GET') {
    return false;
  }

  // All member and org routes require auth, as do protected mutations above.
  return (
    pathname.startsWith('/api/member/') ||
    pathname.startsWith('/api/org') ||
    (pathname.startsWith('/api/invite/') && method === 'POST') ||
    (pathname === '/api/agent-config' && method === 'PUT') ||
    (pathname === '/api/provider-config' && method === 'PUT')
  );
}

/** Returns the appropriate Access-Control-Allow-Origin for the request origin. */
function getCorsOrigin(request: NextRequest): string {
  const allowed = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:8080').split(',').map(s => s.trim());
  const origin = request.headers.get('origin') ?? '';
  return allowed.includes(origin) ? origin : allowed[0];
}

export async function proxy(request: NextRequest) {
  const corsOrigin = getCorsOrigin(request);
  const corsHeadersMap = { 'Access-Control-Allow-Origin': corsOrigin };

  // SECURITY: Always strip client-supplied X-User-Id before forwarding.
  // This header is exclusively set by this proxy after JWT verification —
  // trusting it from the client would allow complete authentication bypass.
  // We build sanitizedHeaders once and use it in every NextResponse.next() call.
  const sanitizedHeaders = new Headers(request.headers);
  sanitizedHeaders.delete('X-User-Id');
  sanitizedHeaders.delete('x-user-id'); // belt-and-suspenders: strip lowercase too

  /** Helper: forward the request with sanitized headers + security response headers. */
  function passThrough(extraRequestHeaders?: Headers): NextResponse {
    const forwardHeaders = extraRequestHeaders ?? sanitizedHeaders;
    const res = NextResponse.next({ request: { headers: forwardHeaders } });
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      res.headers.set(key, value);
    }
    return res;
  }

  // Pass OPTIONS preflight through - route handlers return the correct CORS response
  if (request.method === 'OPTIONS') {
    return passThrough();
  }

  // Apply security headers to the final response (used for non-early paths)
  const response = passThrough();

  if (!requiresProxyAuth(request)) {
    return response;
  }

  // Skip auth if no JWT secret is configured (dev mode without Supabase)
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) {
    return response;
  }

  // Extract Bearer token
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing or invalid Authorization header' },
      { status: 401, headers: corsHeadersMap }
    );
  }

  const token = authHeader.slice(7);
  const result = await verifySupabaseToken(token, jwtSecret);

  if (!result) {
    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 401, headers: corsHeadersMap }
    );
  }

  // Set X-User-Id header for downstream route handlers (on top of sanitized headers)
  const authedHeaders = new Headers(sanitizedHeaders);
  authedHeaders.set('X-User-Id', result.userId);

  return passThrough(authedHeaders);
}

export const config = {
  matcher: ['/api/:path*'],
};
