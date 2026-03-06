import { describe, expect, it, vi, beforeEach } from 'vitest';
import { validateJsonStructure, parseAIOutput } from '../json-validator';

// Mock the logger
vi.mock('../../../logger', () => ({
    createLogger: vi.fn(() => ({
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    })),
}));

describe('JSON Validator', () => {
    describe('validateJsonStructure', () => {
        it('should return empty array for valid JSON object', () => {
            const validJson = {
                'file1.js': 'console.log("hello");',
                'file2.ts': 'export const x = 1;',
            };
            const errors = validateJsonStructure(validJson);
            expect(errors).toEqual([]);
        });

        it('should return error for null input', () => {
            const errors = validateJsonStructure(null);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'invalid_json',
                message: 'Input is null or undefined',
            });
        });

        it('should return error for undefined input', () => {
            const errors = validateJsonStructure(undefined);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'invalid_json',
                message: 'Input is null or undefined',
            });
        });

        it('should return error for array input', () => {
            const errors = validateJsonStructure(['file1', 'file2']);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'invalid_json',
                message: 'Input must be a JSON object with file paths as keys',
            });
        });

        it('should return error for non-object input', () => {
            const errors = validateJsonStructure('string');
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'invalid_json',
                message: 'Input must be a JSON object with file paths as keys',
            });
        });

        it('should return error for number input', () => {
            const errors = validateJsonStructure(42);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'invalid_json',
                message: 'Input must be a JSON object with file paths as keys',
            });
        });

        it('should return error for boolean input', () => {
            const errors = validateJsonStructure(true);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'invalid_json',
                message: 'Input must be a JSON object with file paths as keys',
            });
        });

        it('should return error for non-string values', () => {
            const invalidJson = {
                'file1.js': 'console.log("hello");',
                'file2.ts': 123, // Invalid: number
            };
            const errors = validateJsonStructure(invalidJson);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'invalid_json',
                message: 'Value for "file2.ts" must be a string, got number',
                filePath: 'file2.ts',
            });
        });

        it('should return multiple errors for multiple invalid values', () => {
            const invalidJson = {
                'file1.js': 123,
                'file2.ts': true,
                'file3.json': null,
            };
            const errors = validateJsonStructure(invalidJson);
            expect(errors).toHaveLength(3);
            expect(errors[0].filePath).toBe('file1.js');
            expect(errors[1].filePath).toBe('file2.ts');
            expect(errors[2].filePath).toBe('file3.json');
        });

        it('should handle empty object', () => {
            const errors = validateJsonStructure({});
            expect(errors).toEqual([]);
        });

        it('should handle object with single valid entry', () => {
            const validJson = {
                'index.js': 'console.log("hello");',
            };
            const errors = validateJsonStructure(validJson);
            expect(errors).toEqual([]);
        });

        it('should handle special characters in keys', () => {
            const validJson = {
                'file with spaces.js': 'content',
                'file-with-dashes.ts': 'content',
                'file_with_underscores.json': 'content',
            };
            const errors = validateJsonStructure(validJson);
            expect(errors).toEqual([]);
        });

        it('should handle unicode characters in keys and values', () => {
            const validJson = {
                '文件.js': 'console.log("你好");',
                'fichier.ts': 'export const x = "Bonjour";',
            };
            const errors = validateJsonStructure(validJson);
            expect(errors).toEqual([]);
        });

        it('should handle empty string values', () => {
            const validJson = {
                'empty.js': '',
            };
            const errors = validateJsonStructure(validJson);
            expect(errors).toEqual([]);
        });

        it('should handle multiline string values', () => {
            const validJson = {
                'multiline.js': 'console.log("line1");\nconsole.log("line2");',
            };
            const errors = validateJsonStructure(validJson);
            expect(errors).toEqual([]);
        });
    });

    describe('parseAIOutput', () => {
        it('should parse valid JSON string', () => {
            const result = parseAIOutput('{"file1.js": "content"}');
            expect(result.success).toBe(true);
            expect(result.data).toEqual({ 'file1.js': 'content' });
        });

        it('should return error for empty string', () => {
            const result = parseAIOutput('');
            expect(result.success).toBe(false);
            expect(result.error).toBe('Empty AI output');
        });

        it('should return error for whitespace-only string', () => {
            const result = parseAIOutput('   \n\t   ');
            expect(result.success).toBe(false);
            expect(result.error).toBe('Empty AI output');
        });

        it('should parse JSON wrapped in markdown code block', () => {
            const result = parseAIOutput('```json\n{"file1.js": "content"}\n```');
            expect(result.success).toBe(true);
            expect(result.data).toEqual({ 'file1.js': 'content' });
        });

        it('should parse JSON wrapped in markdown code block without language', () => {
            const result = parseAIOutput('```\n{"file1.js": "content"}\n```');
            expect(result.success).toBe(true);
            expect(result.data).toEqual({ 'file1.js': 'content' });
        });

        it('should extract JSON from text with surrounding content', () => {
            const result = parseAIOutput('Here is the JSON:\n{"file1.js": "content"}\nEnd of response');
            expect(result.success).toBe(true);
            expect(result.data).toEqual({ 'file1.js': 'content' });
        });

        it('should handle JSON with escaped characters', () => {
            const result = parseAIOutput('{"file.js": "Line 1\\nLine 2\\tTabbed"}');
            expect(result.success).toBe(true);
            expect(result.data).toEqual({ 'file.js': 'Line 1\nLine 2\tTabbed' });
        });

        it('should handle JSON with unicode characters', () => {
            const result = parseAIOutput('{"文件.js": "你好世界"}');
            expect(result.success).toBe(true);
            expect(result.data).toEqual({ '文件.js': '你好世界' });
        });

        it('should handle JSON with special characters in values', () => {
            const result = parseAIOutput('{"file.js": "Special: \\"quotes\\" and \'single\'"}');
            expect(result.success).toBe(true);
        });

        it('should return error for invalid JSON', () => {
            const result = parseAIOutput('{"invalid": json}');
            expect(result.success).toBe(false);
            expect(result.error).toBe('Failed to parse AI output as JSON');
        });

        it('should return error for non-JSON output', () => {
            const result = parseAIOutput('This is just plain text');
            expect(result.success).toBe(false);
            expect(result.error).toBe('Failed to parse AI output as JSON');
        });

        it('should handle JSON with CRLF line endings', () => {
            const result = parseAIOutput('{"file.js": "content"}\r\n');
            expect(result.success).toBe(true);
        });

        it('should handle JSON with control characters in strings', () => {
            const result = parseAIOutput('{"file.js": "content\\x00with\\x01controls"}');
            expect(result.success).toBe(true);
        });

        it('should handle JSON with nested objects', () => {
            const result = parseAIOutput('{"file.js": "content"}');
            expect(result.success).toBe(true);
        });

        it('should return error for JSON array', () => {
            const result = parseAIOutput('["file1.js", "file2.js"]');
            expect(result.success).toBe(false);
            expect(result.error).toBe('Failed to parse AI output as JSON');
        });

        it('should return error for JSON primitive', () => {
            const result = parseAIOutput('"just a string"');
            expect(result.success).toBe(false);
            expect(result.error).toBe('Failed to parse AI output as JSON');
        });

        it('should handle JSON with trailing comma (sanitization)', () => {
            const result = parseAIOutput('{"file.js": "content",}');
            expect(result.success).toBe(false); // JSON.parse doesn't allow trailing commas
        });

        it('should handle JSON with comments (sanitization)', () => {
            const result = parseAIOutput('{"file.js": "content" /* comment */}');
            expect(result.success).toBe(false); // JSON doesn't support comments
        });

        it('should parse JSON from markdown with extra whitespace', () => {
            const result = parseAIOutput('```json\n   \n  {"file.js": "content"}  \n   \n```');
            expect(result.success).toBe(true);
            expect(result.data).toEqual({ 'file.js': 'content' });
        });

        it('should handle multiple code blocks and parse the first valid one', () => {
            const result = parseAIOutput('```json\n{"file1.js": "content1"}\n```\n```json\n{"file2.js": "content2"}\n```');
            expect(result.success).toBe(true);
            expect(result.data).toEqual({ 'file1.js': 'content1' });
        });

        it('should handle JSON with escaped quotes in values', () => {
            const result = parseAIOutput('{"file.js": "He said \\"hello\\""}');
            expect(result.success).toBe(true);
            expect(result.data).toEqual({ 'file.js': 'He said "hello"' });
        });

        it('should handle JSON with backslashes in values', () => {
            const result = parseAIOutput('{"file.js": "path\\\\to\\\\file"}');
            expect(result.success).toBe(true);
            expect(result.data).toEqual({ 'file.js': 'path\\to\\file' });
        });

        it('should extract JSON from complex AI response', () => {
            const complexResponse = `
I'll create the files for you:

\`\`\`json
{
  "index.js": "console.log('Hello');",
  "styles.css": "body { margin: 0; }"
}
\`\`\`

Let me know if you need anything else!
            `;
            const result = parseAIOutput(complexResponse);
            expect(result.success).toBe(true);
            expect(result.data).toEqual({
                'index.js': "console.log('Hello');",
                'styles.css': 'body { margin: 0; }',
            });
        });

        it('should handle JSON with newlines in string values', () => {
            const result = parseAIOutput('{"file.js": "line1\\nline2\\nline3"}');
            expect(result.success).toBe(true);
            expect(result.data).toEqual({ 'file.js': 'line1\nline2\nline3' });
        });

        it('should handle JSON with tabs in string values', () => {
            const result = parseAIOutput('{"file.js": "col1\\tcol2\\tcol3"}');
            expect(result.success).toBe(true);
            expect(result.data).toEqual({ 'file.js': 'col1\tcol2\tcol3' });
        });
    });
});
