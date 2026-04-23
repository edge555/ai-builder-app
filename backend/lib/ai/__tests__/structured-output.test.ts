import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { extractJsonFromResponse, parseStructuredOutput } from '../structured-output';

describe('extractJsonFromResponse', () => {
  describe('Strategy 1: direct parse', () => {
    it('returns raw text when it is valid JSON', () => {
      const raw = '{"ok":true}';
      expect(extractJsonFromResponse(raw)).toBe('{"ok":true}');
    });

    it('handles a bare JSON array via direct parse', () => {
      const raw = '[1,2,3]';
      expect(extractJsonFromResponse(raw)).toBe('[1,2,3]');
    });
  });

  describe('Strategy 2: markdown code block', () => {
    it('extracts JSON from a markdown json block', () => {
      const raw = 'note: ```json\n{"ok":true}\n```';
      expect(extractJsonFromResponse(raw)).toBe('{"ok":true}');
    });

    it('extracts JSON from an untagged markdown block', () => {
      const raw = 'Here:\n```\n{"ok":true}\n```';
      expect(extractJsonFromResponse(raw)).toBe('{"ok":true}');
    });
  });

  describe('Strategy 3: brace matching', () => {
    it('extracts JSON when string fields contain brace characters', () => {
      const raw = 'prefix text {"reasoning":"contains } and { braces","ok":true} suffix text';
      expect(extractJsonFromResponse(raw)).toBe('{"reasoning":"contains } and { braces","ok":true}');
    });

    it('continues scanning when an earlier balanced object is invalid JSON', () => {
      const raw = 'prefix {not-json} {"ok":true}';
      expect(extractJsonFromResponse(raw)).toBe('{"ok":true}');
    });
  });

  describe('null / failure cases', () => {
    it('returns null for empty string', () => {
      expect(extractJsonFromResponse('')).toBeNull();
    });

    it('returns null for plain text with no JSON', () => {
      expect(extractJsonFromResponse('just some text here')).toBeNull();
    });

    it('returns null for incomplete JSON', () => {
      expect(extractJsonFromResponse('{"ok": true')).toBeNull();
    });
  });
});

describe('parseStructuredOutput', () => {
  it('parses structured output after extracting from wrapped text', () => {
    const schema = z.object({
      reasoning: z.string(),
      ok: z.boolean(),
    });
    const raw = 'note: ```json\n{"reasoning":"contains }","ok":true}\n```';
    const result = parseStructuredOutput(raw, schema, 'TestOutput');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ok).toBe(true);
      expect(result.data.reasoning).toBe('contains }');
    }
  });

  it('returns failure when extraction succeeds but schema validation fails', () => {
    const schema = z.object({ count: z.number() });
    const raw = '{"count":"not-a-number"}';
    const result = parseStructuredOutput(raw, schema, 'TestOutput');

    expect(result.success).toBe(false);
  });

  it('returns failure when no JSON can be extracted', () => {
    const schema = z.object({ ok: z.boolean() });
    const result = parseStructuredOutput('just text', schema, 'TestOutput');

    expect(result.success).toBe(false);
  });
});
