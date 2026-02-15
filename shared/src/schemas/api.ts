import { z } from 'zod';

// ============================================================================
// Common Schemas
// ============================================================================

export const SerializedProjectStateSchema = z.object({
    id: z.string().min(1, 'Project state must have a valid id'),
    name: z.string().min(1, 'Project name is required'),
    description: z.string(),
    files: z.record(
        z.string().refine((path) => !path.includes('..') && !path.startsWith('/') && !path.match(/^[a-zA-Z]:/), {
            message: 'Invalid file path: must be relative and cannot contain traversal (..)',
        }),
        z.string().max(500 * 1024, 'File content too large (max 500KB)')
    ).refine((files) => Object.keys(files).length <= 200, {
        message: 'Too many files (max 200)',
    }),
    createdAt: z.string(),
    updatedAt: z.string(),
    currentVersionId: z.string(),
});

// ============================================================================
// Request Schemas
// ============================================================================

/**
 * Schema for /api/generate
 */
export const GenerateProjectRequestSchema = z.object({
    description: z.string().min(1, 'Project description is required').max(50000, 'Project description is too long (max 50,000 characters)'),
});

/**
 * Schema for /api/modify
 */
export const ModifyProjectRequestSchema = z.object({
    projectState: SerializedProjectStateSchema,
    prompt: z.string().min(1, 'Modification prompt is required').max(50000, 'Modification prompt is too long (max 50,000 characters)'),
    skipPlanning: z.boolean().optional(),
    runtimeError: z.any().optional(), // RuntimeError type is complex, using any for now or skipping detailed validation
});

/**
 * Schema for /api/plan
 */
export const FileMetadataEntrySchema = z.object({
    path: z.string().min(1, 'Each metadata entry must have a valid path field'),
    fileType: z.enum(['component', 'style', 'config', 'utility', 'hook', 'api_route', 'other']),
    lineCount: z.number().int().nonnegative(),
    exports: z.array(z.string()),
    imports: z.array(z.string()),
});

export const PlanProjectRequestSchema = z.object({
    fileTreeMetadata: z.array(FileMetadataEntrySchema).min(1, 'fileTreeMetadata cannot be empty'),
    projectName: z.string().optional(),
    projectDescription: z.string().optional(),
    prompt: z.string().min(1, 'Prompt is required'),
});

/**
 * Schema for /api/revert
 */
export const RevertVersionRequestSchema = z.object({
    projectId: z.string().min(1, 'Project ID is required'),
    versionId: z.string().min(1, 'Version ID is required'),
});

/**
 * Schema for /api/versions (query params)
 */
export const GetVersionsRequestSchema = z.object({
    projectId: z.string().min(1, 'Project ID is required'),
});

/**
 * Schema for /api/diff
 */
export const ComputeDiffRequestSchema = z.object({
    fromVersionId: z.string().min(1, 'fromVersionId is required'),
    toVersionId: z.string().min(1, 'toVersionId is required'),
    projectId: z.string().optional(),
});

/**
 * Schema for /api/export
 */
export const ExportProjectRequestSchema = z.object({
    projectState: SerializedProjectStateSchema,
});
