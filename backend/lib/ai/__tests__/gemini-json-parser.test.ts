import { describe, expect, it, beforeEach } from 'vitest';
import { createParserState, parseStreamChunk, trimParserBuffer, StreamParserState } from '../gemini-json-parser';
import type { GeminiAPIResponse } from '../gemini-types';

describe('gemini-json-parser', () => {
  let state: StreamParserState;

  beforeEach(() => {
    state = createParserState();
  });

  describe('createParserState', () => {
    it('should create initial parser state', () => {
      expect(state).toEqual({
        buffer: '',
        braceCount: 0,
        inString: false,
        escapeNext: false,
        objectStart: -1,
        lastExtractedIndex: 0,
      });
    });
  });

  describe('parseStreamChunk', () => {
    it('should parse a complete JSON object', () => {
      const apiResponse: GeminiAPIResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello, World!' }],
            },
          },
        ],
      };

      const chunk = JSON.stringify(apiResponse);
      const result = parseStreamChunk(chunk, state);

      expect(result).toEqual(['Hello, World!']);
      expect(state.buffer).toBe(''); // Buffer should be trimmed after extraction
    });

    it('should handle partial chunks split across boundaries', () => {
      const apiResponse: GeminiAPIResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Test content' }],
            },
          },
        ],
      };

      const fullChunk = JSON.stringify(apiResponse);
      const mid = Math.floor(fullChunk.length / 2);

      // Send first half
      let result = parseStreamChunk(fullChunk.substring(0, mid), state);
      expect(result).toEqual([]); // No complete object yet

      // Send second half
      result = parseStreamChunk(fullChunk.substring(mid), state);
      expect(result).toEqual(['Test content']);
      expect(state.buffer).toBe(''); // Buffer should be trimmed after extraction
    });

    it('should extract multiple objects from stream', () => {
      const obj1: GeminiAPIResponse = {
        candidates: [{ content: { parts: [{ text: 'First' }] } }],
      };
      const obj2: GeminiAPIResponse = {
        candidates: [{ content: { parts: [{ text: 'Second' }] } }],
      };

      const chunk = JSON.stringify(obj1) + JSON.stringify(obj2);
      const result = parseStreamChunk(chunk, state);

      expect(result).toEqual(['First', 'Second']);
      expect(state.buffer).toBe(''); // Buffer should be trimmed after all extractions
    });

    it('should skip invalid JSON objects gracefully', () => {
      const invalidChunk = '{invalid json}';
      const result = parseStreamChunk(invalidChunk, state);

      expect(result).toEqual([]);
    });

    it('should handle escaped quotes in strings', () => {
      const apiResponse: GeminiAPIResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Content with "escaped" quotes' }],
            },
          },
        ],
      };

      const chunk = JSON.stringify(apiResponse);
      const result = parseStreamChunk(chunk, state);

      expect(result).toEqual(['Content with "escaped" quotes']);
      expect(state.buffer).toBe('');
    });

    it('should throw error when buffer exceeds 5MB', () => {
      // Create a large chunk that exceeds 5MB
      const largeText = 'x'.repeat(6 * 1024 * 1024); // 6MB
      const apiResponse: GeminiAPIResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: largeText }],
            },
          },
        ],
      };

      const chunk = JSON.stringify(apiResponse);

      expect(() => parseStreamChunk(chunk, state)).toThrow(/Buffer size exceeded maximum/);
    });

    it('should maintain buffer under 5MB with sliding window for large responses', () => {
      // Simulate streaming a 50MB response by sending many small objects
      const totalSize = 50 * 1024 * 1024; // 50MB target
      const chunkSize = 100 * 1024; // 100KB per object
      const numChunks = Math.ceil(totalSize / chunkSize);

      let maxBufferSize = 0;
      let totalExtracted = 0;

      for (let i = 0; i < numChunks; i++) {
        // Create a chunk with text of approximately chunkSize
        const text = `Chunk ${i}: ${'x'.repeat(chunkSize - 50)}`;
        const apiResponse: GeminiAPIResponse = {
          candidates: [
            {
              content: {
                parts: [{ text }],
              },
            },
          ],
        };

        const chunk = JSON.stringify(apiResponse);
        const result = parseStreamChunk(chunk, state);

        // Track maximum buffer size
        maxBufferSize = Math.max(maxBufferSize, state.buffer.length);
        totalExtracted += result.length;

        // Buffer should never exceed a reasonable size (well under 5MB)
        // With sliding window, it should stay around the size of one JSON object
        expect(state.buffer.length).toBeLessThan(500 * 1024); // 500KB safety margin
      }

      // Verify we extracted all chunks
      expect(totalExtracted).toBe(numChunks);

      // Verify max buffer size stayed bounded (should be much less than 5MB)
      expect(maxBufferSize).toBeLessThan(1 * 1024 * 1024); // Should stay under 1MB

      console.log(`Processed ${numChunks} chunks (~${Math.round(totalSize / 1024 / 1024)}MB total)`);
      console.log(`Max buffer size: ${Math.round(maxBufferSize / 1024)}KB`);
    });

    it('should trim buffer after each successful extraction', () => {
      const obj1: GeminiAPIResponse = {
        candidates: [{ content: { parts: [{ text: 'First' }] } }],
      };
      const obj2: GeminiAPIResponse = {
        candidates: [{ content: { parts: [{ text: 'Second' }] } }],
      };

      // Parse first object
      parseStreamChunk(JSON.stringify(obj1), state);
      const bufferAfterFirst = state.buffer.length;

      // Buffer should be empty or minimal after extraction
      expect(bufferAfterFirst).toBe(0);

      // Parse second object
      parseStreamChunk(JSON.stringify(obj2), state);
      expect(state.buffer.length).toBe(0);
    });
  });

  describe('trimParserBuffer', () => {
    it('should clear buffer when between objects', () => {
      state.buffer = 'some garbage data';
      state.braceCount = 0;
      state.objectStart = -1;

      trimParserBuffer(state);

      expect(state.buffer).toBe('');
      expect(state.lastExtractedIndex).toBe(0);
    });

    it('should not trim buffer when inside an object', () => {
      state.buffer = '{"key": "val';
      state.braceCount = 1;
      state.objectStart = 0;

      trimParserBuffer(state);

      // Buffer should not be cleared when we're inside an object
      expect(state.buffer).toBe('{"key": "val');
    });

    it('should trim garbage before object start', () => {
      const garbage = 'x'.repeat(2000);
      state.buffer = garbage + '{"key": "value"}';
      state.objectStart = 2000;
      state.braceCount = 1;

      trimParserBuffer(state);

      expect(state.buffer).toBe('{"key": "value"}');
      expect(state.objectStart).toBe(0);
      expect(state.lastExtractedIndex).toBe(0);
    });

    it('should not trim when garbage is below threshold', () => {
      const garbage = 'x'.repeat(500);
      const original = garbage + '{"key": "value"}';
      state.buffer = original;
      state.objectStart = 500;
      state.braceCount = 1;

      trimParserBuffer(state);

      // Should not trim if garbage is less than 1000 bytes
      expect(state.buffer).toBe(original);
    });
  });

  describe('integration: streaming scenario', () => {
    it('should handle realistic streaming with incremental chunks', () => {
      const responses = [
        { text: 'import React from "react";' },
        { text: 'export default function App() {' },
        { text: '  return <div>Hello</div>;' },
        { text: '}' },
      ];

      const allResults: string[] = [];

      for (const response of responses) {
        const apiResponse: GeminiAPIResponse = {
          candidates: [{ content: { parts: [{ text: response.text }] } }],
        };

        const chunk = JSON.stringify(apiResponse);
        const result = parseStreamChunk(chunk, state);
        allResults.push(...result);

        // Trim buffer periodically (as gemini-client does)
        trimParserBuffer(state);
      }

      expect(allResults).toHaveLength(4);
      expect(allResults).toEqual([
        'import React from "react";',
        'export default function App() {',
        '  return <div>Hello</div>;',
        '}',
      ]);

      // Final buffer should be clean
      expect(state.buffer).toBe('');
    });
  });
});
