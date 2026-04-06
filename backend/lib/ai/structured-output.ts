import type { ZodType } from 'zod';
import { extractJsonFromResponse } from './modal-response-parser';

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
