import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCorsHeaders, handleOptions, handleError } from '../../../lib/api';
import { load, save } from '../../../lib/ai/agent-config-store';

export async function OPTIONS() {
  return handleOptions();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const config = await load();
    return NextResponse.json(config, { status: 200, headers: getCorsHeaders(request) });
  } catch (error) {
    return handleError(error, 'api/agent-config GET', request);
  }
}

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

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const config = AgentConfigSchema.parse(body);
    await save(config);
    return NextResponse.json(config, { status: 200, headers: getCorsHeaders(request) });
  } catch (error) {
    return handleError(error, 'api/agent-config PUT', request);
  }
}
