import type { NextRequest } from 'next/server';
import type { ZodSchema } from 'zod';
import { formatZodError } from './zod-error';

type ParseResult<T> = { ok: true; data: T } | { ok: false; response: Response };

/**
 * Parses and validates a JSON request body against a Zod schema.
 * Returns { ok: true, data } on success or { ok: false, response } with a 400 Response on failure.
 */
export async function parseJsonRequest<T>(
  request: NextRequest,
  schema: ZodSchema<T>
): Promise<ParseResult<T>> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return { ok: false, response: new Response('Invalid JSON in request body', { status: 400 }) };
  }

  try {
    const data = schema.parse(rawBody);
    return { ok: true, data };
  } catch (error: unknown) {
    return {
      ok: false,
      response: new Response(`Invalid request: ${formatZodError(error)}`, { status: 400 }),
    };
  }
}
