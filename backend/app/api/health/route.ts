import { NextRequest } from 'next/server';
import { getCorsHeaders, handleOptions } from '../../../lib/api';
import { applyRateLimit, RateLimitTier } from '../../../lib/security';
import { config } from '../../../lib/config';

export async function OPTIONS() {
  return handleOptions();
}

export async function GET(request: NextRequest) {
  const { blocked, headers: rlHeaders } = applyRateLimit(request, RateLimitTier.LOW_COST);
  if (blocked) return blocked;

  return Response.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      provider: config.provider.name,
      rateLimiter: {
        enabled: config.rateLimit.enabled,
      },
    },
    { headers: { ...getCorsHeaders(request), ...rlHeaders } }
  );
}
