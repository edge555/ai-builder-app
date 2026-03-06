import { NextRequest } from 'next/server';
import { getCorsHeaders, handleOptions } from '../../../lib/api';
import { applyRateLimit, RateLimitTier } from '../../../lib/security';

export async function OPTIONS() {
  return handleOptions();
}

export async function GET(request: NextRequest) {
  const blocked = applyRateLimit(request, RateLimitTier.LOW_COST);
  if (blocked) return blocked;

  return Response.json(
    { status: 'ok', timestamp: new Date().toISOString() },
    { headers: getCorsHeaders(request) }
  );
}
