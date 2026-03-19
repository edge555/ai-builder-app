import { z } from 'zod';

import { RUNTIME_ERROR_TYPES, ERROR_PRIORITIES, ERROR_SOURCES } from '../types/runtime-error';

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
// Response Schemas (shared between frontend validation and backend responses)
// ============================================================================

export const DiffChangeSchema = z.object({
    type: z.enum(['add', 'delete', 'context']),
    lineNumber: z.number().int(),
    content: z.string(),
});

export const DiffHunkSchema = z.object({
    oldStart: z.number().int(),
    oldLines: z.number().int(),
    newStart: z.number().int(),
    newLines: z.number().int(),
    changes: z.array(DiffChangeSchema),
});

export const FileDiffSchema = z.object({
    filePath: z.string(),
    status: z.enum(['added', 'modified', 'deleted']),
    hunks: z.array(DiffHunkSchema),
});

export const SerializedVersionSchema = z.object({
    id: z.string(),
    projectId: z.string(),
    prompt: z.string(),
    timestamp: z.string(),
    files: z.record(z.string(), z.string()),
    diffs: z.array(FileDiffSchema),
    parentVersionId: z.string().nullable(),
});

export const RuntimeErrorSchema = z.object({
    message: z.string(),
    stack: z.string().optional(),
    componentStack: z.string().optional(),
    filePath: z.string().optional(),
    line: z.number().optional(),
    column: z.number().optional(),
    type: z.enum(RUNTIME_ERROR_TYPES),
    priority: z.enum(ERROR_PRIORITIES),
    timestamp: z.string(),
    source: z.enum(ERROR_SOURCES),
    suggestedFixes: z.array(z.string()).optional(),
    rawError: z.unknown().optional(),
});

// ============================================================================
// Request Schemas
// ============================================================================

/**
 * Schema for an image attachment.
 */
export const ImageAttachmentSchema = z.object({
    url: z.string().url('Attachment URL must be valid'),
    type: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
    alt: z.string().max(200, 'Alt text too long (max 200 characters)').optional(),
});

/**
 * Schema for /api/generate
 */
export const GenerateProjectRequestSchema = z.object({
    description: z.string().min(1, 'Project description is required').max(50000, 'Project description is too long (max 50,000 characters)'),
    attachments: z.array(ImageAttachmentSchema).max(5, 'Maximum 5 image attachments').optional(),
});

/**
 * Schema for a single conversation turn (user or assistant).
 * Used to send recent conversation history with modification requests.
 */
export const ConversationTurnSchema = z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(500),
    changeSummary: z.object({
        description: z.string().max(300),
        affectedFiles: z.array(z.string()).max(20),
    }).optional(),
});

export type ConversationTurn = z.infer<typeof ConversationTurnSchema>;

/**
 * Schema for /api/modify
 */
export const ModifyProjectRequestSchema = z.object({
    projectState: SerializedProjectStateSchema,
    prompt: z.string().min(1, 'Modification prompt is required').max(50000, 'Modification prompt is too long (max 50,000 characters)'),
    shouldSkipPlanning: z.boolean().optional(),
    runtimeError: z.object({
        message: z.string(),
        stack: z.string().optional(),
        type: z.enum(RUNTIME_ERROR_TYPES),
        source: z.enum(ERROR_SOURCES),
        priority: z.enum(ERROR_PRIORITIES),
    }).optional(),
    errorContext: z.object({
        affectedFiles: z.array(z.string()),
        errorType: z.enum(RUNTIME_ERROR_TYPES),
    }).optional(),
    conversationHistory: z.array(ConversationTurnSchema).max(10).optional(),
    attachments: z.array(ImageAttachmentSchema).max(5, 'Maximum 5 image attachments').optional(),
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
    fileTreeMetadata: z.array(FileMetadataEntrySchema).min(1, 'fileTreeMetadata cannot be empty').max(500, 'Too many files in metadata (max 500)'),
    projectName: z.string().optional(),
    projectDescription: z.string().optional(),
    prompt: z.string().min(1, 'Prompt is required').max(50000, 'Prompt is too long (max 50,000 characters)'),
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
