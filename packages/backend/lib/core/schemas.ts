/**
 * Zod Schemas for AI Output Validation
 * Provides runtime validation with TypeScript type inference.
 */

import { z } from 'zod';

// Project generation output schema
export const GeneratedFileSchema = z.object({
    path: z.string().min(1).describe('The file path relative to project root'),
    content: z.string().describe('The complete content of the file'),
});

export const ProjectOutputSchema = z.object({
    files: z.array(GeneratedFileSchema).describe('Array of files with their paths and contents'),
});

export type ProjectOutput = z.infer<typeof ProjectOutputSchema>;
export type GeneratedFile = z.infer<typeof GeneratedFileSchema>;

// Modification output schema
export const EditOperationSchema = z.object({
    search: z.string().min(1).describe('The precise code block to find'),
    replace: z.string().describe('The replacement code'),
    occurrence: z.number().optional().describe('Optional occurrence index (1-indexed)'),
});

// Use discriminated union to prevent invalid operation/content combinations
export const FileModificationSchema = z.discriminatedUnion('operation', [
    z.object({
        path: z.string().min(1).describe('Path to the file'),
        operation: z.literal('create'),
        content: z.string().min(1).describe('Full content for the new file'),
    }),
    z.object({
        path: z.string().min(1).describe('Path to the file'),
        operation: z.literal('modify'),
        edits: z.array(EditOperationSchema).min(1).describe('List of search/replace operations'),
    }),
    z.object({
        path: z.string().min(1).describe('Path to the file'),
        operation: z.literal('delete'),
    }),
]);

export const ModificationOutputSchema = z.object({
    files: z.array(FileModificationSchema).min(1).describe('Array of file modifications'),
});

export type ModificationOutput = z.infer<typeof ModificationOutputSchema>;
export type FileModification = z.infer<typeof FileModificationSchema>;

// Planning response schema
export const PlanningResponseSchema = z.object({
    primaryFiles: z.array(z.string()).describe('Files that need to be modified'),
    contextFiles: z.array(z.string()).describe('Files needed for reference/types'),
    category: z.enum(['ui', 'logic', 'style', 'mixed']).default('mixed').describe('Category of modification: ui (components/UI), logic (business logic), style (CSS/styling), or mixed'),
    reasoning: z.string().optional().default('').describe('Brief explanation of the selection'),
});

export type PlanningResponse = z.infer<typeof PlanningResponseSchema>;

type GeminiSchema = {
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
};

function getZodDef(schema: z.ZodTypeAny): ZodDef | undefined {
    const maybeSchema = schema as {
        _zod?: { def?: ZodDef };
        _def?: ZodDef;
        def?: ZodDef;
    };

    return maybeSchema._zod?.def ?? maybeSchema._def ?? maybeSchema.def;
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
    } else {
        result.type = 'string';
    }

    return result;
}
