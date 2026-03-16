import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCorsHeaders, handleOptions, handleError, parseJsonRequest, withRouteContext } from '../../../lib/api';
import { load, save } from '../../../lib/ai/agent-config-store';
import { applyRateLimit, RateLimitTier } from '../../../lib/security';

export async function OPTIONS() {
  return handleOptions();
}

// Env var names for per-task OpenRouter model overrides
const TASK_ENV_VARS: Record<string, string> = {
  intent: 'OPENROUTER_INTENT_MODEL',
  planning: 'OPENROUTER_PLANNING_MODEL',
  execution: 'OPENROUTER_EXECUTION_MODEL',
  bugfix: 'OPENROUTER_BUGFIX_MODEL',
  review: 'OPENROUTER_REVIEW_MODEL',
};

export const GET = withRouteContext('api/agent-config', async (ctx, request: NextRequest) => {
  const { contextLogger } = ctx;
  const { blocked, headers: rlHeaders } = applyRateLimit(request, RateLimitTier.CONFIG);
  ctx.setRateLimitHeaders(rlHeaders);
  if (blocked) return blocked as NextResponse;

  try {
    const config = await load();

    // Augment each task with envOverride if the env var is explicitly set
    for (const [taskType, envVar] of Object.entries(TASK_ENV_VARS)) {
      const envValue = process.env[envVar];
      if (envValue !== undefined) {
        config.tasks[taskType as keyof typeof config.tasks].envOverride = envValue;
      }
    }

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

const TASK_TYPES = ['intent', 'planning', 'execution', 'bugfix', 'review'] as const;

const TaskConfigSchema = z.object({
  taskType: z.enum(TASK_TYPES),
  models: z.array(ModelEntrySchema),
});

const AgentConfigSchema = z.object({
  version: z.literal(1),
  tasks: z.object({
    intent: TaskConfigSchema,
    planning: TaskConfigSchema,
    execution: TaskConfigSchema,
    bugfix: TaskConfigSchema,
    review: TaskConfigSchema,
  }),
});

export const PUT = withRouteContext('api/agent-config', async (ctx, request: NextRequest) => {
  const { contextLogger } = ctx;
  const { blocked, headers: rlHeaders } = applyRateLimit(request, RateLimitTier.CONFIG);
  ctx.setRateLimitHeaders(rlHeaders);
  if (blocked) return blocked as NextResponse;

  const parsed = await parseJsonRequest(request, AgentConfigSchema);
  if (!parsed.ok) return parsed.response;

  try {
    await save(parsed.data);
    contextLogger.info('Agent config saved');
    return NextResponse.json(parsed.data, { status: 200, headers: getCorsHeaders(request, { rejectInvalidOrigin: true }) });
  } catch (error) {
    return handleError(error, 'api/agent-config PUT', request);
  }
});
