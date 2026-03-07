/**
 * Tests for modal-response-parser module
 * Following industry best practices: AAA pattern, clear descriptions, edge cases
 */

import { describe, it, expect, vi } from 'vitest';
import { extractJsonFromResponse } from '../modal-response-parser';

// Mock the logger
vi.mock('../../logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('extractJsonFromResponse - direct parse', () => {
  it('should extract valid JSON object directly', () => {
    // Arrange
    const rawText = '{"key": "value"}';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"key": "value"}');
  });

  it('should extract valid JSON array directly', () => {
    // Arrange
    const rawText = '[1, 2, 3]';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('[1, 2, 3]');
  });

  it('should extract nested JSON structures directly', () => {
    // Arrange
    const rawText = '{"outer": {"inner": {"deep": "value"}}}';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"outer": {"inner": {"deep": "value"}}}');
  });

  it('should extract JSON with arrays of objects directly', () => {
    // Arrange
    const rawText = '{"items": [{"id": 1}, {"id": 2}]}';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"items": [{"id": 1}, {"id": 2}]}');
  });

  it('should handle whitespace in direct JSON', () => {
    // Arrange
    const rawText = '  { "key" : "value" }  ';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('  { "key" : "value" }  ');
  });

  it('should handle newlines in direct JSON', () => {
    // Arrange
    const rawText = '{\n  "key": "value"\n}';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{\n  "key": "value"\n}');
  });

  it('should handle tabs in direct JSON', () => {
    // Arrange
    const rawText = '{\t"key": "value"\t}';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{\t"key": "value"\t}');
  });

  it('should handle empty JSON object directly', () => {
    // Arrange
    const rawText = '{}';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{}');
  });

  it('should handle empty JSON array directly', () => {
    // Arrange
    const rawText = '[]';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('[]');
  });

  it('should handle JSON with special characters in strings', () => {
    // Arrange
    const rawText = '{"key": "value with \\"quotes\\" and \\\\backslashes"}';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"key": "value with \\"quotes\\" and \\\\backslashes"}');
  });

  it('should handle JSON with unicode characters', () => {
    // Arrange
    const rawText = '{"key": "value 世界 🌍"}';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"key": "value 世界 🌍"}');
  });

  it('should handle JSON with numbers', () => {
    // Arrange
    const rawText = '{"int": 42, "float": 3.14, "negative": -10}';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"int": 42, "float": 3.14, "negative": -10}');
  });

  it('should handle JSON with booleans', () => {
    // Arrange
    const rawText = '{"true": true, "false": false}';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"true": true, "false": false}');
  });

  it('should handle JSON with null values', () => {
    // Arrange
    const rawText = '{"null": null, "value": "not null"}';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"null": null, "value": "not null"}');
  });
});

describe('extractJsonFromResponse - markdown extraction', () => {
  it('should extract JSON from ```json code block', () => {
    // Arrange
    const rawText = 'Here is the JSON:\n```json\n{"key": "value"}\n```';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"key": "value"}');
  });

  it('should extract JSON from ``` code block without json label', () => {
    // Arrange
    const rawText = 'Here is the JSON:\n```\n{"key": "value"}\n```';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"key": "value"}');
  });

  it('should extract JSON from code block with extra whitespace', () => {
    // Arrange
    const rawText = '```json  \n  {"key": "value"}  \n```';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"key": "value"}');
  });

  it('should handle multiple code blocks and extract first valid JSON', () => {
    // Arrange
    const rawText = '```json\n{"first": "valid"}\n```\nSome text\n```json\n{"second": "valid"}\n```';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"first": "valid"}');
  });

  it('should skip invalid code blocks and find valid one', () => {
    // Arrange
    const rawText = '```json\n{invalid json}\n```\n```json\n{"valid": "json"}\n```';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"valid": "json"}');
  });

  it('should extract JSON from code block with nested structures', () => {
    // Arrange
    const rawText = '```json\n{"outer": {"inner": {"deep": "value"}}}\n```';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"outer": {"inner": {"deep": "value"}}}');
  });

  it('should extract JSON array from code block', () => {
    // Arrange
    const rawText = '```json\n[1, 2, 3]\n```';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('[1, 2, 3]');
  });

  it('should handle code block with text before and after', () => {
    // Arrange
    const rawText = 'Some text before\n```json\n{"key": "value"}\n```\nSome text after';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"key": "value"}');
  });

  it('should handle code block with newlines inside', () => {
    // Arrange
    const rawText = '```json\n{\n  "key": "value",\n  "nested": {\n    "deep": "value"\n  }\n}\n```';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{\n  "key": "value",\n  "nested": {\n    "deep": "value"\n  }\n}');
  });
});

describe('extractJsonFromResponse - brace matching', () => {
  it('should extract JSON object embedded in text', () => {
    // Arrange
    const rawText = 'Here is some text {"key": "value"} and more text';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"key": "value"}');
  });

  it('should extract JSON array embedded in text', () => {
    // Arrange
    const rawText = 'Here is some text [1, 2, 3] and more text';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('[1, 2, 3]');
  });

  it('should handle nested objects with brace matching', () => {
    // Arrange
    const rawText = 'Text before {"outer": {"inner": "value"}} text after';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"outer": {"inner": "value"}}');
  });

  it('should handle nested arrays with bracket matching', () => {
    // Arrange
    const rawText = 'Text before [[1, 2], [3, 4]] text after';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('[[1, 2], [3, 4]]');
  });

  it('should handle mixed nested structures', () => {
    // Arrange
    const rawText = 'Text before {"items": [{"id": 1}, {"id": 2}]} text after';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"items": [{"id": 1}, {"id": 2}]}');
  });

  it('should handle strings with quotes inside JSON', () => {
    // Arrange
    const rawText = 'Text before {"key": "value with \\"quotes\\""} text after';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"key": "value with \\"quotes\\""}');
  });

  it('should handle escaped backslashes in strings', () => {
    // Arrange
    const rawText = 'Text before {"key": "path\\\\to\\\\file"} text after';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"key": "path\\\\to\\\\file"}');
  });

  it('should handle newlines in strings', () => {
    // Arrange
    const rawText = 'Text before {"key": "line1\\nline2"} text after';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"key": "line1\\nline2"}');
  });

  it('should handle tabs in strings', () => {
    // Arrange
    const rawText = 'Text before {"key": "col1\\tcol2"} text after';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"key": "col1\\tcol2"}');
  });

  it('should handle escaped quotes in nested strings', () => {
    // Arrange
    const rawText = 'Text before {"outer": {"inner": "value with \\"quotes\\""}} text after';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"outer": {"inner": "value with \\"quotes\\""}}');
  });

  it('should ignore braces inside strings', () => {
    // Arrange
    const rawText = 'Text before {"key": "value with {braces}"} text after';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"key": "value with {braces}"}');
  });

  it('should ignore brackets inside strings', () => {
    // Arrange
    const rawText = 'Text before {"key": "value with [brackets]"} text after';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"key": "value with [brackets]"}');
  });

  it('should handle deeply nested structures', () => {
    // Arrange
    const rawText = 'Text before {"l1": {"l2": {"l3": {"l4": {"l5": "deep"}}}}} text after';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"l1": {"l2": {"l3": {"l4": {"l5": "deep"}}}}}');
  });

  it('should find first JSON object when multiple exist', () => {
    // Arrange
    const rawText = 'Text before {"first": "value"} text between {"second": "value"} text after';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"first": "value"}');
  });

  it('should find first JSON array when multiple exist', () => {
    // Arrange
    const rawText = 'Text before [1, 2, 3] text between [4, 5, 6] text after';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('[1, 2, 3]');
  });
});

describe('extractJsonFromResponse - edge cases', () => {
  it('should return null for completely invalid text', () => {
    // Arrange
    const rawText = 'This is just plain text with no JSON';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBeNull();
  });

  it('should return null for malformed JSON object', () => {
    // Arrange
    const rawText = '{invalid json object}';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBeNull();
  });

  it('should return null for malformed JSON array', () => {
    // Arrange
    const rawText = '[invalid json array]';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBeNull();
  });

  it('should return null for incomplete JSON object', () => {
    // Arrange
    const rawText = '{"key": "value"';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBeNull();
  });

  it('should return null for incomplete JSON array', () => {
    // Arrange
    const rawText = '[1, 2, 3';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBeNull();
  });

  it('should handle empty string', () => {
    // Arrange
    const rawText = '';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBeNull();
  });

  it('should handle whitespace only', () => {
    // Arrange
    const rawText = '   \n\t   ';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBeNull();
  });

  it('should handle very long JSON', () => {
    // Arrange
    const largeArray = Array.from({ length: 1000 }, (_, i) => ({ id: i, value: `item${i}` }));
    const rawText = JSON.stringify(largeArray);

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe(rawText);
  });

  it('should handle JSON with special unicode characters', () => {
    // Arrange
    const rawText = '{"emoji": "🎉", "chinese": "中文", "arabic": "العربية"}';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe(rawText);
  });

  it('should handle JSON with control characters', () => {
    // Arrange
    const rawText = '{"key": "value\\b\\f\\n\\r\\t"}';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe(rawText);
  });

  it('should handle JSON with mixed line endings', () => {
    // Arrange
    const rawText = '{\r\n  "key": "value"\r\n}';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{\r\n  "key": "value"\r\n}');
  });

  it('should prefer direct parse over markdown extraction', () => {
    // Arrange
    const rawText = '{"direct": "json"}\n```json\n{"markdown": "json"}\n```';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"direct": "json"}');
  });

  it('should prefer markdown extraction over brace matching', () => {
    // Arrange
    const rawText = 'Text before ```json\n{"markdown": "json"}\n``` text between {"brace": "json"} text after';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"markdown": "json"}');
  });

  it('should handle JSON with numbers and scientific notation', () => {
    // Arrange
    const rawText = '{"small": 1e-10, "large": 1e10, "normal": 42}';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"small": 1e-10, "large": 1e10, "normal": 42}');
  });

  it('should handle JSON with escaped unicode', () => {
    // Arrange
    const rawText = '{"key": "\\u0048\\u0065\\u006c\\u006c\\u006f"}';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"key": "\\u0048\\u0065\\u006c\\u006c\\u006f"}');
  });
});

describe('extractJsonFromResponse - complex scenarios', () => {
  it('should handle JSON with all data types', () => {
    // Arrange
    const rawText = JSON.stringify({
      string: 'text',
      number: 42,
      float: 3.14,
      boolean: true,
      null: null,
      array: [1, 2, 3],
      object: { nested: 'value' },
    });

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe(rawText);
  });

  it('should handle JSON with duplicate keys (last wins)', () => {
    // Arrange
    const rawText = '{"key": "first", "key": "second"}';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe(rawText);
    const parsed = JSON.parse(result!);
    expect(parsed.key).toBe('second');
  });

  it('should handle very deeply nested JSON', () => {
    // Arrange
    let obj = { value: 'deep' } as any;
    for (let i = 0; i < 50; i++) {
      obj = { level: i, nested: obj };
    }
    const rawText = JSON.stringify(obj);

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe(rawText);
  });

  it('should handle JSON with many properties', () => {
    // Arrange
    const obj: Record<string, string> = {};
    for (let i = 0; i < 100; i++) {
      obj[`key${i}`] = `value${i}`;
    }
    const rawText = JSON.stringify(obj);

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe(rawText);
  });

  it('should handle markdown block with trailing spaces', () => {
    // Arrange
    const rawText = '```json   \n{"key": "value"}   \n```';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"key": "value"}');
  });

  it('should handle markdown block with leading spaces', () => {
    // Arrange
    const rawText = '  ```json\n  {"key": "value"}\n  ```';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"key": "value"}');
  });

  it('should handle mixed brace types in text', () => {
    // Arrange
    const rawText = 'Text with {braces} and [brackets] before {"json": "object"} after';

    // Act
    const result = extractJsonFromResponse(rawText);

    // Assert
    expect(result).toBe('{"json": "object"}');
  });
});
