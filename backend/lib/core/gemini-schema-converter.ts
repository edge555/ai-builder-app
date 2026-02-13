/**
 * Gemini Schema Converter
 * Converts Zod schemas to Gemini-compatible JSON schema format.
 */

import { z } from 'zod';

export type GeminiSchema = {
  type?: 'object' | 'array' | 'string' | 'number';
  description?: string;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  items?: GeminiSchema;
  enum?: string[];
};

type ZodDef = {
  description?: string;
  type?: string;
  shape?: Record<string, z.ZodTypeAny> | (() => Record<string, z.ZodTypeAny>);
  element?: z.ZodTypeAny;
  innerType?: z.ZodTypeAny;
  values?: string[];
  options?: z.ZodTypeAny[];
  discriminator?: string;
};

function getZodDef(schema: z.ZodTypeAny): ZodDef | undefined {
  const maybeSchema = schema as {
    _def?: ZodDef;
    def?: ZodDef;
  };

  return maybeSchema._def ?? maybeSchema.def;
}

function resolveShape(shape: ZodDef['shape']): Record<string, z.ZodTypeAny> | undefined {
  if (!shape) {
    return undefined;
  }

  if (typeof shape === 'function') {
    return shape();
  }

  return shape;
}

/**
 * Convert Zod schema to Gemini-compatible JSON schema.
 * Compatible with Zod 4.x
 */
export function toGeminiSchema(schema: z.ZodTypeAny): GeminiSchema {
  const result: GeminiSchema = {};

  // Get description from various possible locations (Zod 4 compatibility)
  const def = getZodDef(schema);
  const description =
    def?.description || (schema as { description?: string }).description;

  if (description) {
    result.description = description;
  }

  // Check schema type property for Zod 4
  const schemaType = (schema as { type?: string }).type ?? def?.type;

  if (schemaType === 'object' || schema instanceof z.ZodObject) {
    result.type = 'object';
    const shape = resolveShape(
      (schema as { shape?: ZodDef['shape'] }).shape ?? def?.shape
    );
    const properties: Record<string, GeminiSchema> = {};
    const required: string[] = [];

    if (shape) {
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = toGeminiSchema(value);
        const valueType =
          (value as { type?: string }).type ?? getZodDef(value)?.type;
        if (valueType !== 'optional' && valueType !== 'default') {
          required.push(key);
        }
      }
    }

    result.properties = properties;
    if (required.length > 0) {
      result.required = required;
    }
  } else if (schemaType === 'array' || schema instanceof z.ZodArray) {
    result.type = 'array';
    // Zod 4 uses .element for array inner type
    const innerSchema =
      (schema as { element?: z.ZodTypeAny }).element ?? def?.element;
    if (innerSchema instanceof z.ZodType) {
      result.items = toGeminiSchema(innerSchema);
    } else {
      result.items = { type: 'string' };
    }
  } else if (schemaType === 'enum' || schema instanceof z.ZodEnum) {
    result.type = 'string';
    result.enum =
      (schema as { options?: string[] }).options ?? def?.values;
  } else if (schemaType === 'string' || schema instanceof z.ZodString) {
    result.type = 'string';
  } else if (schemaType === 'number' || schema instanceof z.ZodNumber) {
    result.type = 'number';
  } else if (schemaType === 'optional' || schema instanceof z.ZodOptional) {
    const innerType =
      (schema as { unwrap?: () => z.ZodTypeAny }).unwrap?.() ??
      def?.innerType;
    if (innerType instanceof z.ZodType) {
      return toGeminiSchema(innerType);
    }
    result.type = 'string';
  } else if (schemaType === 'default' || schema instanceof z.ZodDefault) {
    const innerType = def?.innerType;
    if (innerType instanceof z.ZodType) {
      return toGeminiSchema(innerType);
    }
    result.type = 'string';
  } else if (schemaType === 'discriminatedUnion' || schemaType === 'union') {
    // Handle discriminated unions and regular unions
    // Gemini doesn't support oneOf/anyOf, so we merge all variants into a single object
    const options = (schema as { options?: z.ZodTypeAny[] }).options ?? def?.options;

    if (options && Array.isArray(options) && options.length > 0) {
      result.type = 'object';
      const allProperties: Record<string, GeminiSchema> = {};
      const propertyCounts: Record<string, number> = {};

      // Process each variant (should be objects)
      for (const variant of options) {
        const variantSchema = toGeminiSchema(variant);

        if (variantSchema.type === 'object' && variantSchema.properties) {
          for (const [key, value] of Object.entries(variantSchema.properties)) {
            allProperties[key] = value;
            propertyCounts[key] = (propertyCounts[key] || 0) + 1;
          }
        }
      }

      // Properties that appear in ALL variants are required
      const required: string[] = [];
      for (const [key, count] of Object.entries(propertyCounts)) {
        if (count === options.length) {
          required.push(key);
        }
      }

      result.properties = allProperties;
      if (required.length > 0) {
        result.required = required;
      }
    } else {
      // Fallback if we can't get options
      result.type = 'string';
    }
  } else {
    result.type = 'string';
  }

  return result;
}
