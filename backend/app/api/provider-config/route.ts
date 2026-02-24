import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCorsHeaders, handleOptions, handleError } from '../../../lib/api';
import {
  getProviderConfigWithSource,
  saveProvider,
} from '../../../lib/ai/provider-config-store';
import { resetProviderSingletons } from '../../../lib/ai/ai-provider-factory';

export async function OPTIONS() {
  return handleOptions();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const result = await getProviderConfigWithSource();
    return NextResponse.json(result, { status: 200, headers: getCorsHeaders(request) });
  } catch (error) {
    return handleError(error, 'api/provider-config GET', request);
  }
}

const ProviderConfigSchema = z.object({
  aiProvider: z.enum(['openrouter', 'modal']).nullable(),
});

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { aiProvider } = ProviderConfigSchema.parse(body);
    await saveProvider(aiProvider);
    resetProviderSingletons();
    const result = await getProviderConfigWithSource();
    return NextResponse.json(result, { status: 200, headers: getCorsHeaders(request) });
  } catch (error) {
    return handleError(error, 'api/provider-config PUT', request);
  }
}
