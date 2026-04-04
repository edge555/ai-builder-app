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

/** Routes that don't require authentication */
const PUBLIC_PATHS = ['/api/health'];

/** Returns the appropriate Access-Control-Allow-Origin for the request origin. */
function getCorsOrigin(request: NextRequest): string {
  const allowed = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:8080').split(',').map(s => s.trim());
  const origin = request.headers.get('origin') ?? '';
  return allowed.includes(origin) ? origin : allowed[0];
}

export async function middleware(request: NextRequest) {
  const corsOrigin = getCorsOrigin(request);
  const corsHeadersMap = { 'Access-Control-Allow-Origin': corsOrigin };

  const response = NextResponse.next();

  // Apply security headers
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  // Pass OPTIONS preflight through — route handlers return the correct CORS response
  if (request.method === 'OPTIONS') {
    return response;
  }

  // Skip auth for public routes
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p)) {
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

  // Set X-User-Id header for downstream route handlers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('X-User-Id', result.userId);

  return NextResponse.next({
    request: { headers: requestHeaders },
    headers: Object.fromEntries(Object.entries(SECURITY_HEADERS)),
  });
}

export const config = {
  matcher: ['/api/:path*'],
};
