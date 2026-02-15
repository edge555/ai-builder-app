/**
 * Gemini JSON Stream Parser
 * Handles incremental parsing of JSON objects from streaming responses.
 */

import { createLogger } from '../logger';
import { truncatePayload } from './gemini-utils';
import type { GeminiAPIResponse } from './gemini-types';

const logger = createLogger('gemini-json-parser');

/**
 * Maximum buffer size before throwing an error (5MB).
 * This prevents unbounded memory growth during large streaming responses.
 */
const MAX_BUFFER_SIZE = 5 * 1024 * 1024; // 5MB

export interface StreamParserState {
  buffer: string;
  braceCount: number;
  inString: boolean;
  escapeNext: boolean;
  objectStart: number;
  /** Index in buffer where last successful extraction occurred */
  lastExtractedIndex: number;
}

export function createParserState(): StreamParserState {
  return {
    buffer: '',
    braceCount: 0,
    inString: false,
    escapeNext: false,
    objectStart: -1,
    lastExtractedIndex: 0,
  };
}

/**
 * Processes a chunk of text and extracts complete JSON objects.
 * Returns an array of extracted text chunks from valid candidate responses.
 * Implements sliding window buffer to prevent unbounded memory growth.
 */
export function parseStreamChunk(
  chunkText: string,
  state: StreamParserState
): string[] {
  const chunks: string[] = [];
  const startPos = state.buffer.length;
  state.buffer += chunkText;

  // Check buffer size before processing - hard cap at 5MB
  if (state.buffer.length > MAX_BUFFER_SIZE) {
    const error = `Buffer size exceeded maximum of ${MAX_BUFFER_SIZE} bytes (current: ${state.buffer.length} bytes)`;
    logger.error('Parser buffer overflow', {
      bufferSize: state.buffer.length,
      maxSize: MAX_BUFFER_SIZE,
    });
    throw new Error(error);
  }

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

            // Sliding window: after successfully extracting an object,
            // trim everything before the end of this object
            const extractionEndIndex = i + 1;
            state.lastExtractedIndex = extractionEndIndex;

            // Trim buffer immediately after successful extraction
            if (extractionEndIndex > 0) {
              state.buffer = state.buffer.substring(extractionEndIndex);
              // Adjust indices after trimming
              i = -1; // Will be incremented to 0 in next iteration
              state.objectStart = -1;
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
 * With the new sliding window approach, this is mostly a safety net.
 */
export function trimParserBuffer(state: StreamParserState): void {
  // Only trim when we are between objects to avoid cutting an object in half
  if (state.objectStart === -1 && state.braceCount === 0) {
    // Between objects - safe to clear buffer entirely
    if (state.buffer.length > 0) {
      logger.debug('Trimming buffer between objects', {
        bufferSize: state.buffer.length,
      });
      state.buffer = '';
      state.lastExtractedIndex = 0;
    }
  } else if (state.objectStart > 1000) {
    // If we've started an object but have significant garbage before it, trim the garbage
    logger.debug('Trimming garbage before object start', {
      garbageSize: state.objectStart,
      bufferSize: state.buffer.length,
    });
    state.buffer = state.buffer.substring(state.objectStart);
    state.objectStart = 0;
    state.lastExtractedIndex = 0;
  }
}
