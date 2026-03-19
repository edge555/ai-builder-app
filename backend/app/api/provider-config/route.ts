import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCorsHeaders, handleOptions, handleError, parseJsonRequest, withRouteContext } from '../../../lib/api';
import { getProviderConfigWithSource, saveProvider } from '../../../lib/ai/provider-config-store';
import { resetProviderSingletons } from '../../../lib/ai/ai-provider-factory';
import { applyRateLimit, RateLimitTier } from '../../../lib/security';

export async function OPTIONS() {
  return handleOptions();
}

export const GET = withRouteContext('api/provider-config', async (ctx, request: NextRequest) => {
  const { contextLogger } = ctx;
  const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.CONFIG);
  ctx.setRateLimitHeaders(rlHeaders);
  if (blocked) return blocked as NextResponse;

  try {
    const result = await getProviderConfigWithSource();
    contextLogger.info('Provider config fetched');
    return NextResponse.json(result, { status: 200, headers: getCorsHeaders(request) });
  } catch (error) {
    return handleError(error, 'api/provider-config GET', request);
  }
});

const ProviderConfigSchema = z.object({
  aiProvider: z.enum(['openrouter', 'modal']).nullable(),
});

export const PUT = withRouteContext('api/provider-config', async (ctx, request: NextRequest) => {
  const { contextLogger } = ctx;
  const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.CONFIG);
  ctx.setRateLimitHeaders(rlHeaders);
  if (blocked) return blocked as NextResponse;

  const parsed = await parseJsonRequest(request, ProviderConfigSchema);
  if (!parsed.ok) return parsed.response;

  try {
    await saveProvider(parsed.data.aiProvider);
    resetProviderSingletons();
    const result = await getProviderConfigWithSource();
    contextLogger.info('Provider config updated', { aiProvider: parsed.data.aiProvider });
    return NextResponse.json(result, { status: 200, headers: getCorsHeaders(request, { rejectInvalidOrigin: true }) });
  } catch (error) {
    return handleError(error, 'api/provider-config PUT', request);
  }
});
