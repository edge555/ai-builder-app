import { NextRequest } from 'next/server';
import { getCorsHeaders, handleOptions } from '../../../lib/api';
import { applyRateLimit, RateLimitTier } from '../../../lib/security';
import { config } from '../../../lib/config';
import { getMetricsSummary } from '../../../lib/metrics';

export async function OPTIONS() {
  return handleOptions();
}

/**
 * Checks AI provider reachability with a 5-second timeout.
 * Returns latency on success, error message on failure.
 */
async function checkProviderReachability(): Promise<{
  reachable: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const start = Date.now();

  try {
    let url: string;
    const headers: Record<string, string> = {};

    if (config.provider.name === 'openrouter') {
      url = 'https://openrouter.ai/api/v1/models';
      if (config.provider.openrouterApiKey) {
        headers['Authorization'] = `Bearer ${config.provider.openrouterApiKey}`;
      }
    } else {
      url = config.provider.modalApiUrl!;
    }

    const response = await fetch(url, { signal: controller.signal, headers });
    return { reachable: response.status < 500, latencyMs: Date.now() - start };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      reachable: false,
      error: controller.signal.aborted ? 'timeout after 5s' : error,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  const { blocked, headers: rlHeaders } = applyRateLimit(request, RateLimitTier.LOW_COST);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const deep = url.searchParams.get('deep') === 'true';
  const metrics = url.searchParams.get('metrics') === 'true';

  const body: Record<string, unknown> = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    provider: config.provider.name,
    rateLimiter: {
      enabled: config.rateLimit.enabled,
    },
  };

  if (deep) {
    const providerCheck = await checkProviderReachability();
    body.providerCheck = {
      provider: config.provider.name,
      ...providerCheck,
    };
    if (!providerCheck.reachable) {
      body.status = 'degraded';
    }
  }

  if (metrics) {
    body.metrics = getMetricsSummary();
  }

  return Response.json(body, {
    headers: { ...getCorsHeaders(request), ...rlHeaders },
  });
}
