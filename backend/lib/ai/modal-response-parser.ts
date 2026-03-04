/**
 * @module ai/modal-response-parser
 * @description Extracts valid JSON from raw Modal API responses.
 * Unlike Gemini's `responseSchema`, Modal may return raw JSON, markdown-fenced
 * JSON, or JSON embedded within surrounding text. Three strategies are attempted
 * in order: direct parse → markdown extraction → brace matching.
 *
 * @requires ../logger - Warning logs for unparseable responses
 */

import { createLogger } from '../logger';

const logger = createLogger('modal-response-parser');

/**
 * Extracts a JSON string from a raw Modal response using multiple strategies.
 * Returns the extracted JSON string, or null if no valid JSON could be found.
 */
export function extractJsonFromResponse(rawText: string): string | null {
  const trimmed = rawText.trim();

  // Strategy 1: Direct JSON parse
  const direct = tryDirectParse(trimmed);
  if (direct !== null) return direct;

  // Strategy 2: Markdown code block extraction
  const markdown = tryMarkdownExtraction(trimmed);
  if (markdown !== null) return markdown;

  // Strategy 3: Brace-matching
  const braceMatched = tryBraceMatching(trimmed);
  if (braceMatched !== null) return braceMatched;

  logger.warn('Failed to extract JSON from Modal response', {
    responseLength: rawText.length,
    preview: rawText.slice(0, 200),
  });

  return null;
}

/**
 * Strategy 1: Try parsing the entire response as JSON directly.
 */
function tryDirectParse(text: string): string | null {
  try {
    JSON.parse(text);
    return text;
  } catch {
    return null;
  }
}

/**
 * Strategy 2: Extract JSON from markdown code blocks (```json ... ``` or ``` ... ```).
 */
function tryMarkdownExtraction(text: string): string | null {
  // Match ```json ... ``` or ``` ... ``` blocks
  const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const candidate = match[1].trim();
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // This code block didn't contain valid JSON, try next
    }
  }

  return null;
}

/**
 * Strategy 3: Find the outermost JSON object or array using brace/bracket matching.
 * Uses single-pass scanning with string-awareness to handle nested structures.
 */
function tryBraceMatching(text: string): string | null {
  // Find the first '{' or '['
  let startIndex = -1;
  let openChar: string | null = null;
  let closeChar: string | null = null;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      startIndex = i;
      openChar = '{';
      closeChar = '}';
      break;
    }
    if (text[i] === '[') {
      startIndex = i;
      openChar = '[';
      closeChar = ']';
      break;
    }
  }

  if (startIndex === -1 || !openChar || !closeChar) return null;

  // Single-pass scan tracking depth and string state
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === openChar) {
      depth++;
    } else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(startIndex, i + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}
