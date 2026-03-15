import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCorsHeaders, handleOptions, handleError, parseJsonRequest, withRouteContext } from '../../../lib/api';
import { load, save } from '../../../lib/ai/agent-config-store';
import { applyRateLimit, RateLimitTier } from '../../../lib/security';

export async function OPTIONS() {
  return handleOptions();
}

export const GET = withRouteContext('api/agent-config', async ({ contextLogger }, request: NextRequest) => {
  const blocked = applyRateLimit(request, RateLimitTier.CONFIG);
  if (blocked) return blocked as NextResponse;

  try {
    const config = await load();
    contextLogger.info('Agent config fetched');
    return NextResponse.json(config, { status: 200, headers: getCorsHeaders(request) });
  } catch (error) {
    return handleError(error, 'api/agent-config GET', request);
  }
});

// ---- Zod schema for PUT body validation ----

const ModelEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  active: z.boolean(),
  priority: z.number().int().min(0),
});

const TASK_TYPES = ['intent', 'planning', 'coding', 'debugging', 'documentation'] as const;

const TaskConfigSchema = z.object({
  taskType: z.enum(TASK_TYPES),
  models: z.array(ModelEntrySchema),
});

const AgentConfigSchema = z.object({
  version: z.literal(1),
  tasks: z.object({
    intent: TaskConfigSchema,
    planning: TaskConfigSchema,
    coding: TaskConfigSchema,
    debugging: TaskConfigSchema,
    documentation: TaskConfigSchema,
  }),
});

export const PUT = withRouteContext('api/agent-config', async ({ contextLogger }, request: NextRequest) => {
  const blocked = applyRateLimit(request, RateLimitTier.CONFIG);
  if (blocked) return blocked as NextResponse;

  const parsed = await parseJsonRequest(request, AgentConfigSchema);
  if (!parsed.ok) return parsed.response;

  try {
    await save(parsed.data);
    contextLogger.info('Agent config saved');
    return NextResponse.json(parsed.data, { status: 200, headers: getCorsHeaders(request) });
  } catch (error) {
    return handleError(error, 'api/agent-config PUT', request);
  }
});
