import type { ZodType } from 'zod';
import { createLogger } from '../logger';

const logger = createLogger('structured-output');

/**
 * Extracts a JSON string from a raw AI response using multiple strategies:
 * direct parse → markdown extraction → brace matching.
 */
export function extractJsonFromResponse(rawText: string): string | null {
  const trimmed = rawText.trim();

  // Strategy 1: Direct JSON parse
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch { /* fall through */ }

  // Strategy 2: Markdown code block extraction
  const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/g;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(trimmed)) !== null) {
    try {
      JSON.parse(match[1]);
      return match[1];
    } catch { /* continue */ }
  }

  // Strategy 3: Brace matching with string-awareness.
  // Handles wrapper text around JSON while ignoring braces inside string values.
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (ch === '\\') {
        escaping = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
      continue;
    }

    if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) {
        const candidate = trimmed.slice(start, i + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          // Keep scanning for the next balanced object.
          start = -1;
        }
      }
    }
  }

  logger.warn('Failed to extract JSON from AI response', {
    responseLength: rawText.length,
    preview: rawText.slice(0, 200),
  });
  return null;
}

export interface StructuredParseSuccess<T> {
  success: true;
  data: T;
}

export interface StructuredParseFailure {
  success: false;
  error: string;
}

export type StructuredParseResult<T> = StructuredParseSuccess<T> | StructuredParseFailure;

export function getStructuredParseError<T>(result: StructuredParseResult<T>): string {
  return 'error' in result ? result.error : 'Structured parse failed';
}

export function parseStructuredOutput<T>(
  rawContent: string,
  schema: ZodType<T>,
  label: string,
): StructuredParseResult<T> {
  const extracted = extractJsonFromResponse(rawContent);
  if (!extracted) {
    return {
      success: false,
      error: `${label} parse failed: could not extract valid JSON`,
    };
  }

  try {
    const parsed = JSON.parse(extracted);
    const zodResult = schema.safeParse(parsed);
    if (!zodResult.success) {
      return {
        success: false,
        error: `${label} schema mismatch: ${zodResult.error.message}`,
      };
    }

    return { success: true, data: zodResult.data };
  } catch (error) {
    return {
      success: false,
      error: `${label} parse failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
