/**
 * Zod Schemas for AI Output Validation
 * Provides runtime validation with TypeScript type inference.
 */

import { z } from 'zod';

// Path validation regex - allows any valid file path
// AI may generate root-level files like package.json as well as nested paths
const PATH_REGEX = /^[a-zA-Z0-9_\-./]+$/;

// Project generation output schema
export const GeneratedFileSchema = z.object({
    path: z.string().min(1).regex(PATH_REGEX, 'Path contains invalid characters').describe('The file path relative to project root'),
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
        path: z.string().min(1).regex(PATH_REGEX, 'Path must start with src/, public/, frontend/, or app/').describe('Path to the file'),
        operation: z.literal('create'),
        content: z.string().min(1).describe('Full content for the new file'),
    }),
    z.object({
        path: z.string().min(1).regex(PATH_REGEX, 'Path must start with src/, public/, frontend/, or app/').describe('Path to the file'),
        operation: z.literal('modify'),
        edits: z.array(EditOperationSchema).min(1).describe('List of search/replace operations'),
    }),
    z.object({
        path: z.string().min(1).regex(PATH_REGEX, 'Path must start with src/, public/, frontend/, or app/').describe('Path to the file'),
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
