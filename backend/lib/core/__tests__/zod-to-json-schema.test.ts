/**
 * Tests for zod-to-json-schema module
 * Following industry best practices: AAA pattern, clear descriptions, edge cases
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { toSimpleJsonSchema } from '../zod-to-json-schema';

describe('toSimpleJsonSchema', () => {
  describe('object schemas', () => {
    it('should convert simple object schema', () => {
      // Arrange
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('object');
      expect(result.properties).toBeDefined();
      expect(result.properties?.name).toEqual({ type: 'string' });
      expect(result.properties?.age).toEqual({ type: 'number' });
      expect(result.required).toEqual(['name', 'age']);
    });

    it('should convert object with optional fields', () => {
      // Arrange
      const schema = z.object({
        name: z.string(),
        age: z.number().optional(),
      });

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('object');
      expect(result.properties?.name).toEqual({ type: 'string' });
      expect(result.properties?.age).toEqual({ type: 'number' });
      expect(result.required).toEqual(['name']);
    });

    it('should convert object with nested objects', () => {
      // Arrange
      const schema = z.object({
        user: z.object({
          name: z.string(),
          email: z.string(),
        }),
      });

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('object');
      expect(result.properties?.user).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
        },
        required: ['name', 'email'],
      });
    });

    it('should convert object with description', () => {
      // Arrange
      const schema = z.object({
        name: z.string().describe('User name'),
      });

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert: description is on the 'name' field, not on the object itself
      expect(result.description).toBeUndefined();
      expect(result.properties?.name).toEqual({ description: 'User name', type: 'string' });
    });

    it('should convert empty object', () => {
      // Arrange
      const schema = z.object({});

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('object');
      expect(result.properties).toEqual({});
      expect(result.required).toEqual([]);
    });

    it('should convert object with many fields', () => {
      // Arrange
      const fields: Record<string, z.ZodTypeAny> = {};
      for (let i = 0; i < 50; i++) {
        fields[`field${i}`] = z.string();
      }
      const schema = z.object(fields);

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('object');
      expect(result.properties).toBeDefined();
      expect(Object.keys(result.properties || {})).toHaveLength(50);
    });
  });

  describe('array schemas', () => {
    it('should convert simple array schema', () => {
      // Arrange
      const schema = z.array(z.string());

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('array');
      expect(result.items).toEqual({ type: 'string' });
    });

    it('should convert array of objects', () => {
      // Arrange
      const schema = z.array(
        z.object({
          id: z.number(),
          name: z.string(),
        })
      );

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('array');
      expect(result.items).toEqual({
        type: 'object',
        properties: {
          id: { type: 'number' },
          name: { type: 'string' },
        },
        required: ['id', 'name'],
      });
    });

    it('should convert array with description', () => {
      // Arrange
      const schema = z.array(z.string()).describe('List of items');

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.description).toBe('List of items');
      expect(result.type).toBe('array');
    });

    it('should convert array with min/max', () => {
      // Arrange
      const schema = z.array(z.string()).min(1).max(10);

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('array');
      expect(result.items).toEqual({ type: 'string' });
    });
  });

  describe('string schemas', () => {
    it('should convert string schema', () => {
      // Arrange
      const schema = z.string();

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('string');
    });

    it('should convert string with min/max', () => {
      // Arrange
      const schema = z.string().min(1).max(100);

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('string');
    });

    it('should convert string with email validation', () => {
      // Arrange
      const schema = z.string().email();

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('string');
    });

    it('should convert string with url validation', () => {
      // Arrange
      const schema = z.string().url();

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('string');
    });

    it('should convert string with description', () => {
      // Arrange
      const schema = z.string().describe('A string value');

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.description).toBe('A string value');
      expect(result.type).toBe('string');
    });
  });

  describe('number schemas', () => {
    it('should convert number schema', () => {
      // Arrange
      const schema = z.number();

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('number');
    });

    it('should convert number with min/max', () => {
      // Arrange
      const schema = z.number().min(0).max(100);

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('number');
    });

    it('should convert number with int validation', () => {
      // Arrange
      const schema = z.number().int();

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('number');
    });

    it('should convert number with positive validation', () => {
      // Arrange
      const schema = z.number().positive();

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('number');
    });

    it('should convert number with description', () => {
      // Arrange
      const schema = z.number().describe('A number value');

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.description).toBe('A number value');
      expect(result.type).toBe('number');
    });
  });

  describe('enum schemas', () => {
    it('should convert enum schema', () => {
      // Arrange
      const schema = z.enum(['active', 'inactive', 'pending']);

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('string');
      expect(result.enum).toEqual(['active', 'inactive', 'pending']);
    });

    it('should convert enum with description', () => {
      // Arrange
      const schema = z.enum(['a', 'b', 'c']).describe('Status values');

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.description).toBe('Status values');
      expect(result.type).toBe('string');
      expect(result.enum).toEqual(['a', 'b', 'c']);
    });

    it('should convert enum with many values', () => {
      // Arrange
      const values: string[] = [];
      for (let i = 0; i < 100; i++) {
        values.push(`value${i}`);
      }
      const schema = z.enum(values);

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('string');
      expect(result.enum).toEqual(values);
    });
  });

  describe('optional schemas', () => {
    it('should convert optional string', () => {
      // Arrange
      const schema = z.string().optional();

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('string');
    });

    it('should convert optional number', () => {
      // Arrange
      const schema = z.number().optional();

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert: optional unwraps to the inner type
      expect(result.type).toBe('number');
    });

    it('should convert optional object', () => {
      // Arrange
      const schema = z.object({ name: z.string() }).optional();

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert: optional unwraps to the inner type
      expect(result.type).toBe('object');
    });

    it('should convert optional array', () => {
      // Arrange
      const schema = z.array(z.string()).optional();

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert: optional unwraps to the inner type
      expect(result.type).toBe('array');
    });
  });

  describe('default schemas', () => {
    it('should convert default string', () => {
      // Arrange
      const schema = z.string().default('default value');

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('string');
    });

    it('should convert default number', () => {
      // Arrange
      const schema = z.number().default(42);

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert: default unwraps to the inner type
      expect(result.type).toBe('number');
    });

    it('should convert default object', () => {
      // Arrange
      const schema = z.object({ name: z.string() }).default({ name: 'default' });

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert: default unwraps to the inner type
      expect(result.type).toBe('object');
    });

    it('should convert default array', () => {
      // Arrange
      const schema = z.array(z.string()).default([]);

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert: default unwraps to the inner type
      expect(result.type).toBe('array');
    });
  });

  describe('union schemas', () => {
    it('should convert discriminated union', () => {
      // Arrange
      const schema = z.discriminatedUnion('type', [
        z.object({ type: z.literal('a'), value: z.string() }),
        z.object({ type: z.literal('b'), value: z.number() }),
      ]);

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('object');
      expect(result.properties).toBeDefined();
      expect(result.properties?.type).toEqual({ type: 'string' });
      expect(result.properties?.value).toBeDefined();
    });

    it('should convert regular union', () => {
      // Arrange
      const schema = z.union([z.string(), z.number()]);

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert: primitive-only union falls back to string
      expect(result.type).toBe('string');
    });

    it('should convert union with many variants', () => {
      // Arrange
      const schema = z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.object({ name: z.string() }),
      ]);

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert: union merges object variants; object with name property
      expect(result.type).toBe('object');
    });
  });

  describe('complex schemas', () => {
    it('should convert deeply nested object', () => {
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

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('object');
      expect(result.properties?.level1).toEqual({
        type: 'object',
        properties: {
          level2: {
            type: 'object',
            properties: {
              level3: {
                type: 'object',
                properties: {
                  level4: {
                    type: 'object',
                    properties: {
                      value: { type: 'string' },
                    },
                    required: ['value'],
                  },
                },
                required: ['level4'],
              },
            },
            required: ['level3'],
          },
        },
        required: ['level2'],
      });
    });

    it('should convert array of arrays', () => {
      // Arrange
      const schema = z.array(z.array(z.string()));

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('array');
      expect(result.items).toEqual({ type: 'array', items: { type: 'string' } });
    });

    it('should convert object with array properties', () => {
      // Arrange
      const schema = z.object({
        tags: z.array(z.string()),
        items: z.array(z.number()),
      });

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('object');
      expect(result.properties?.tags).toEqual({
        type: 'array',
        items: { type: 'string' },
      });
      expect(result.properties?.items).toEqual({
        type: 'array',
        items: { type: 'number' },
      });
    });

    it('should convert object with mixed types', () => {
      // Arrange
      const schema = z.object({
        name: z.string(),
        age: z.number(),
        isActive: z.boolean(),
        tags: z.array(z.string()),
        metadata: z.object({
          created: z.string(),
          updated: z.string().optional(),
        }),
      });

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('object');
      expect(result.properties?.name).toEqual({ type: 'string' });
      expect(result.properties?.age).toEqual({ type: 'number' });
      expect(result.properties?.isActive).toEqual({ type: 'string' }); // boolean falls back to string
      expect(result.properties?.tags).toEqual({
        type: 'array',
        items: { type: 'string' },
      });
      expect(result.properties?.metadata).toEqual({
        type: 'object',
        properties: {
          created: { type: 'string' },
          updated: { type: 'string' },
        },
        required: ['created'],
      });
    });
  });

  describe('edge cases', () => {
    it('should handle schema with no description', () => {
      // Arrange
      const schema = z.object({ name: z.string() });

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.description).toBeUndefined();
    });

    it('should handle schema with empty description', () => {
      // Arrange
      const schema = z.object({ name: z.string() }).describe('');

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert: empty string is falsy, so description is not set
      expect(result.description).toBeUndefined();
    });

    it('should handle very long description', () => {
      // Arrange
      const longDescription = 'x'.repeat(1000);
      const schema = z.object({ name: z.string() }).describe(longDescription);

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.description).toBe(longDescription);
    });

    it('should handle object with all optional fields', () => {
      // Arrange
      const schema = z.object({
        field1: z.string().optional(),
        field2: z.number().optional(),
        field3: z.boolean().optional(),
      });

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('object');
      expect(result.required).toEqual([]);
    });

    it('should handle object with all required fields', () => {
      // Arrange
      const schema = z.object({
        field1: z.string(),
        field2: z.number(),
        field3: z.boolean(),
      });

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.required).toEqual(['field1', 'field2', 'field3']);
    });

    it('should handle mixed optional and required fields', () => {
      // Arrange
      const schema = z.object({
        required1: z.string(),
        optional1: z.string().optional(),
        required2: z.number(),
        optional2: z.number().optional(),
      });

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.required).toEqual(['required1', 'required2']);
    });

    it('should handle enum with single value', () => {
      // Arrange
      const schema = z.enum(['single']);

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('string');
      expect(result.enum).toEqual(['single']);
    });

    it('should handle array with complex items', () => {
      // Arrange
      const schema = z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          tags: z.array(z.string()),
        })
      );

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('array');
      expect(result.items).toEqual({
        type: 'object',
        properties: {
          id: { type: 'number' },
          name: { type: 'string' },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['id', 'name', 'tags'],
      });
    });
  });

  describe('type safety', () => {
    it('should maintain correct types for object properties', () => {
      // Arrange
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      if (result.properties) {
        expect(typeof result.properties.name.type).toBe('string');
        expect(typeof result.properties.age.type).toBe('string');
      }
    });

    it('should maintain correct types for array items', () => {
      // Arrange
      const schema = z.array(z.string());

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      if (result.items) {
        expect(typeof result.items.type).toBe('string');
      }
    });

    it('should handle discriminated union correctly', () => {
      // Arrange
      const schema = z.discriminatedUnion('type', [
        z.object({ type: z.literal('a'), value: z.string() }),
        z.object({ type: z.literal('b'), value: z.number() }),
      ]);

      // Act
      const result = toSimpleJsonSchema(schema);

      // Assert
      expect(result.type).toBe('object');
      expect(result.properties).toBeDefined();
      if (result.properties) {
        expect(result.properties.value).toBeDefined();
      }
    });
  });
});
