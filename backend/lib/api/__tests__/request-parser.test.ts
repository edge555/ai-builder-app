/**
 * Tests for request-parser module
 * Following industry best practices: AAA pattern, clear descriptions, edge cases, proper mocking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseJsonRequest } from '../request-parser';
import { z } from 'zod';

// Mock the zod-error module
// Note: vi.mock factory is hoisted above imports, so external variables (like `z`) are
// undefined at hoist time. Keep the factory free of outer-scope references.
vi.mock('../zod-error', () => ({
  formatZodError: vi.fn(() => 'mock validation error'),
}));

import { formatZodError } from '../zod-error';

describe('parseJsonRequest', () => {
  let mockRequest: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = {
      json: vi.fn(),
    };
  });

  describe('happy path', () => {
    it('should parse valid JSON request', async () => {
      // Arrange
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });
      const requestBody = { name: 'John', age: 30 };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(requestBody);
      }
    });

    it('should parse JSON with nested objects', async () => {
      // Arrange
      const schema = z.object({
        user: z.object({
          name: z.string(),
          email: z.string(),
        }),
      });
      const requestBody = { user: { name: 'John', email: 'john@example.com' } };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(requestBody);
      }
    });

    it('should parse JSON with arrays', async () => {
      // Arrange
      const schema = z.object({
        items: z.array(z.string()),
      });
      const requestBody = { items: ['item1', 'item2', 'item3'] };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(requestBody);
      }
    });

    it('should parse JSON with optional fields', async () => {
      // Arrange
      const schema = z.object({
        name: z.string(),
        age: z.number().optional(),
      });
      const requestBody = { name: 'John' };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(requestBody);
      }
    });

    it('should parse JSON with default values', async () => {
      // Arrange
      const schema = z.object({
        name: z.string(),
        age: z.number().default(18),
      });
      const requestBody = { name: 'John' };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({ name: 'John', age: 18 });
      }
    });

    it('should parse JSON with transformed values', async () => {
      // Arrange
      const schema = z.object({
        email: z.string().email(),
        age: z.string().transform(val => parseInt(val, 10)),
      });
      const requestBody = { email: 'john@example.com', age: '30' };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({ email: 'john@example.com', age: 30 });
      }
    });

    it('should parse JSON with null values', async () => {
      // Arrange
      const schema = z.object({
        name: z.string().nullable(),
      });
      const requestBody = { name: null };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(requestBody);
      }
    });

    it('should parse JSON with boolean values', async () => {
      // Arrange
      const schema = z.object({
        isActive: z.boolean(),
        isAdmin: z.boolean(),
      });
      const requestBody = { isActive: true, isAdmin: false };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(requestBody);
      }
    });

    it('should parse JSON with number types', async () => {
      // Arrange
      const schema = z.object({
        integer: z.number().int(),
        positive: z.number().positive(),
        negative: z.number().negative(),
      });
      const requestBody = { integer: 42, positive: 3.14, negative: -10 };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(requestBody);
      }
    });

    it('should parse JSON with string validations', async () => {
      // Arrange
      const schema = z.object({
        email: z.string().email(),
        url: z.string().url(),
        uuid: z.string().uuid(),
      });
      const requestBody = {
        email: 'test@example.com',
        url: 'https://example.com',
        uuid: '123e4567-e89b-12d3-a456-426614174000',
      };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(requestBody);
      }
    });
  });

  describe('invalid JSON', () => {
    it('should return error response for invalid JSON', async () => {
      // Arrange
      const schema = z.object({ name: z.string() });
      mockRequest.json.mockRejectedValue(new Error('Invalid JSON'));

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response).toBeInstanceOf(Response);
        expect(result.response.status).toBe(400);
      }
    });

    it('should include error message in response', async () => {
      // Arrange
      const schema = z.object({ name: z.string() });
      mockRequest.json.mockRejectedValue(new Error('Invalid JSON'));

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      if (!result.ok) {
        const text = await result.response.text();
        expect(text).toBe('Invalid JSON in request body');
      }
    });

    it('should handle JSON parse errors', async () => {
      // Arrange
      const schema = z.object({ name: z.string() });
      mockRequest.json.mockRejectedValue(new SyntaxError('Unexpected token'));

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(400);
      }
    });
  });

  describe('schema validation errors', () => {
    it('should return error response for missing required field', async () => {
      // Arrange
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });
      const requestBody = { name: 'John' };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response).toBeInstanceOf(Response);
        expect(result.response.status).toBe(400);
      }
    });

    it('should return error response for wrong type', async () => {
      // Arrange
      const schema = z.object({
        age: z.number(),
      });
      const requestBody = { age: 'thirty' };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(400);
      }
    });

    it('should return error response for invalid email', async () => {
      // Arrange
      const schema = z.object({
        email: z.string().email(),
      });
      const requestBody = { email: 'invalid-email' };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(400);
      }
    });

    it('should return error response for invalid URL', async () => {
      // Arrange
      const schema = z.object({
        url: z.string().url(),
      });
      const requestBody = { url: 'not-a-url' };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(400);
      }
    });

    it('should return error response for string when number expected', async () => {
      // Arrange
      const schema = z.object({
        count: z.number(),
      });
      const requestBody = { count: 'not a number' };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(400);
      }
    });

    it('should return error response for number when string expected', async () => {
      // Arrange
      const schema = z.object({
        name: z.string(),
      });
      const requestBody = { name: 123 };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(400);
      }
    });

    it('should return error response for array when object expected', async () => {
      // Arrange
      const schema = z.object({
        user: z.object({ name: z.string() }),
      });
      const requestBody = { user: ['not', 'an', 'object'] };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(400);
      }
    });

    it('should return error response for object when array expected', async () => {
      // Arrange
      const schema = z.object({
        items: z.array(z.string()),
      });
      const requestBody = { items: { not: 'an array' } };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(400);
      }
    });

    it('should return error response for invalid enum value', async () => {
      // Arrange
      const schema = z.object({
        status: z.enum(['active', 'inactive', 'pending']),
      });
      const requestBody = { status: 'invalid' };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(400);
      }
    });

    it('should return error response for value out of range', async () => {
      // Arrange
      const schema = z.object({
        age: z.number().min(0).max(120),
      });
      const requestBody = { age: 150 };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(400);
      }
    });

    it('should return error response for string too short', async () => {
      // Arrange
      const schema = z.object({
        name: z.string().min(3),
      });
      const requestBody = { name: 'ab' };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(400);
      }
    });

    it('should return error response for string too long', async () => {
      // Arrange
      const schema = z.object({
        name: z.string().max(10),
      });
      const requestBody = { name: 'this name is too long' };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(400);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty object', async () => {
      // Arrange
      const schema = z.object({});
      const requestBody = {};
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({});
      }
    });

    it('should handle object with many fields', async () => {
      // Arrange
      const fields: Record<string, z.ZodTypeAny> = {};
      for (let i = 0; i < 50; i++) {
        fields[`field${i}`] = z.string();
      }
      const schema = z.object(fields);
      const requestBody: Record<string, string> = {};
      for (let i = 0; i < 50; i++) {
        requestBody[`field${i}`] = `value${i}`;
      }
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(requestBody);
      }
    });

    it('should handle deeply nested objects', async () => {
      // Arrange
      const schema = z.object({
        level1: z.object({
          level2: z.object({
            level3: z.object({
              level4: z.object({
                value: z.string(),
              }),
            }),
          }),
        }),
      });
      const requestBody = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep value',
              },
            },
          },
        },
      };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(requestBody);
      }
    });

    it('should handle special characters in strings', async () => {
      // Arrange
      const schema = z.object({
        text: z.string(),
      });
      const requestBody = { text: 'Hello 世界 🌍 \n\t\\' };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(requestBody);
      }
    });

    it('should handle unicode characters', async () => {
      // Arrange
      const schema = z.object({
        text: z.string(),
      });
      const requestBody = { text: 'مرحبا بالعالم 🌍 你好世界' };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(requestBody);
      }
    });

    it('should handle very long strings', async () => {
      // Arrange
      const schema = z.object({
        text: z.string(),
      });
      const longString = 'x'.repeat(10000);
      const requestBody = { text: longString };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.text).toBe(longString);
      }
    });

    it('should handle zero values', async () => {
      // Arrange
      const schema = z.object({
        zero: z.number(),
        emptyString: z.string(),
        emptyArray: z.array(z.string()),
      });
      const requestBody = { zero: 0, emptyString: '', emptyArray: [] };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(requestBody);
      }
    });

    it('should handle negative numbers', async () => {
      // Arrange
      const schema = z.object({
        negative: z.number(),
      });
      const requestBody = { negative: -42 };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(requestBody);
      }
    });

    it('should handle floating point numbers', async () => {
      // Arrange
      const schema = z.object({
        float: z.number(),
      });
      const requestBody = { float: 3.14159265359 };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(requestBody);
      }
    });

    it('should handle scientific notation', async () => {
      // Arrange
      const schema = z.object({
        small: z.number(),
        large: z.number(),
      });
      const requestBody = { small: 1e-10, large: 1e10 };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(requestBody);
      }
    });
  });

  describe('error response formatting', () => {
    it('should include formatted error message', async () => {
      // Arrange
      const schema = z.object({
        name: z.string().min(3),
        age: z.number().min(0),
      });
      const requestBody = { name: 'ab', age: -5 };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      if (!result.ok) {
        const text = await result.response.text();
        expect(text).toContain('Invalid request:');
        expect(formatZodError).toHaveBeenCalled();
      }
    });

    it('should return 400 status for validation errors', async () => {
      // Arrange
      const schema = z.object({
        name: z.string(),
      });
      const requestBody = {};
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      if (!result.ok) {
        expect(result.response.status).toBe(400);
      }
    });

    it('should return 400 status for JSON parse errors', async () => {
      // Arrange
      const schema = z.object({ name: z.string() });
      mockRequest.json.mockRejectedValue(new Error('Invalid JSON'));

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      if (!result.ok) {
        expect(result.response.status).toBe(400);
      }
    });
  });

  describe('type safety', () => {
    it('should infer correct type for parsed data', async () => {
      // Arrange
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });
      const requestBody = { name: 'John', age: 30 };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      if (result.ok) {
        expect(typeof result.data.name).toBe('string');
        expect(typeof result.data.age).toBe('number');
      }
    });

    it('should handle complex nested types', async () => {
      // Arrange
      const schema = z.object({
        users: z.array(
          z.object({
            id: z.number(),
            name: z.string(),
            tags: z.array(z.string()),
          })
        ),
      });
      const requestBody = {
        users: [
          { id: 1, name: 'John', tags: ['admin', 'user'] },
          { id: 2, name: 'Jane', tags: ['user'] },
        ],
      };
      mockRequest.json.mockResolvedValue(requestBody);

      // Act
      const result = await parseJsonRequest(mockRequest, schema);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Array.isArray(result.data.users)).toBe(true);
        expect(result.data.users[0].tags).toEqual(['admin', 'user']);
      }
    });
  });
});
