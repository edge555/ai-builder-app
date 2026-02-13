/**
 * Gemini JSON Stream Parser
 * Handles incremental parsing of JSON objects from streaming responses.
 */

import { createLogger } from '../logger';
import { truncatePayload } from './gemini-utils';
import type { GeminiAPIResponse } from './gemini-types';

const logger = createLogger('gemini-json-parser');

export interface StreamParserState {
  buffer: string;
  braceCount: number;
  inString: boolean;
  escapeNext: boolean;
  objectStart: number;
}

export function createParserState(): StreamParserState {
  return {
    buffer: '',
    braceCount: 0,
    inString: false,
    escapeNext: false,
    objectStart: -1,
  };
}

/**
 * Processes a chunk of text and extracts complete JSON objects.
 * Returns an array of extracted text chunks from valid candidate responses.
 */
export function parseStreamChunk(
  chunkText: string,
  state: StreamParserState
): string[] {
  const chunks: string[] = [];
  const startPos = state.buffer.length;
  state.buffer += chunkText;

  for (let i = startPos; i < state.buffer.length; i++) {
    const char = state.buffer[i];

    if (state.escapeNext) {
      state.escapeNext = false;
      continue;
    }

    if (char === '\\') {
      state.escapeNext = true;
      continue;
    }

    if (char === '"') {
      state.inString = !state.inString;
      continue;
    }

    if (!state.inString) {
      if (char === '{') {
        if (state.braceCount === 0) {
          state.objectStart = i;
        }
        state.braceCount++;
      } else if (char === '}') {
        state.braceCount--;
        if (state.braceCount === 0 && state.objectStart !== -1) {
          // We found a complete JSON object
          const objectText = state.buffer.substring(state.objectStart, i + 1);

          try {
            const data = JSON.parse(objectText) as GeminiAPIResponse;
            const chunk = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (chunk) {
              chunks.push(chunk);
            }
          } catch (e) {
            // This captures partial or malformed objects which can happen at the very start/end
            logger.debug('Skipping non-candidate JSON object in stream', {
              error: e instanceof Error ? e.message : String(e),
              text: truncatePayload(objectText),
            });
          }

          state.objectStart = -1;
        }
      }
    }
  }

  return chunks;
}

/**
 * Trims the parser buffer to manage memory usage.
 * Should be called periodically when between JSON objects.
 */
export function trimParserBuffer(state: StreamParserState): void {
  // Only trim when we are between objects to avoid cutting an object in half
  if (state.objectStart === -1 && state.buffer.length > 5000 && state.braceCount === 0) {
    state.buffer = '';
  } else if (state.objectStart > 2000) {
    // If we've started an object but have a lot of garbage before it
    state.buffer = state.buffer.substring(state.objectStart);
    state.objectStart = 0;
  }
}
