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
    operation: z.literal('replace_file'),
    content: z.string().min(1).describe('Complete replacement content for the entire file'),
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

// ─── Pipeline Stage Schemas ────────────────────────────────────────────────

// Intent stage output
export const IntentOutputSchema = z.object({
  clarifiedGoal: z.string().describe('Refined version of the user goal'),
  complexity: z.enum(['simple', 'medium', 'complex']).describe('Estimated project complexity'),
  features: z.array(z.string()).describe('Key features to implement'),
  technicalApproach: z.string().describe('Recommended technical approach'),
  projectType: z.enum(['spa', 'fullstack', 'fullstack-auth']).optional().describe('Project type: spa for client-only React, fullstack for Next.js+DB, fullstack-auth for Next.js+DB+Auth'),
});

export type IntentOutput = z.infer<typeof IntentOutputSchema>;

// Planning stage output
export const PlanOutputSchema = z.object({
  files: z.array(z.object({
    path: z.string().describe('File path relative to project root'),
    purpose: z.string().describe('What this file does'),
  })).describe('Files to create or modify'),
  components: z.array(z.string()).describe('React components to implement'),
  dependencies: z.array(z.string()).describe('npm packages to include'),
  routing: z.array(z.string()).describe('Routes to define'),
  apiRoutes: z.array(z.object({
    path: z.string().describe('API route path (e.g. /api/users)'),
    method: z.string().describe('HTTP method (GET, POST, PUT, DELETE)'),
    purpose: z.string().describe('What this endpoint does'),
  })).optional().describe('API routes for full-stack projects'),
  databaseModels: z.array(z.object({
    name: z.string().describe('Model name (e.g. User, Post)'),
    fields: z.array(z.string()).describe('Field definitions (e.g. "id String @id @default(uuid())")'),
  })).optional().describe('Database models for Prisma schema'),
  authStrategy: z.enum(['supabase', 'nextauth', 'none']).optional().describe('Authentication strategy'),
});

export type PlanOutput = z.infer<typeof PlanOutputSchema>;

// Review stage output
export const ReviewOutputSchema = z.object({
  verdict: z.enum(['pass', 'fixed']).describe('pass = no changes needed; fixed = corrections provided'),
  corrections: z.array(z.object({
    path: z.string().describe('File path to replace'),
    content: z.string().describe('Full replacement file content'),
    reason: z.string().describe('Why this correction was made'),
  })).describe('Files to replace (empty when verdict is pass)'),
});

export type ReviewOutput = z.infer<typeof ReviewOutputSchema>;

// ─── Architecture Plan Schema (Multi-Phase Generation Pipeline) ────────────

/** Valid layer assignments for files in an architecture plan (used in AI-facing JSON schema). */
export const PhaseLayerEnum = z.enum(['scaffold', 'logic', 'ui', 'integration']);
export type PhaseLayer = z.infer<typeof PhaseLayerEnum>;

/** Execution-time layer — extends PhaseLayer with the internal 'oneshot' virtual layer.
 *  NOT used in the AI-facing planning schema; only used in PhaseDefinition and prompt dispatch. */
export type ExecutionLayer = PhaseLayer | 'oneshot';

/** Schema for type contract definitions shared across phases. */
export const TypeContractSchema = z.object({
  name: z.string().min(1).describe('Type/interface name (e.g. "Todo", "User")'),
  definition: z.string().min(1).describe('Full TypeScript interface/type text'),
});

/** Schema for CSS variable definitions planned across the project. */
export const CSSVariableSchema = z.object({
  name: z.string().min(1).describe('CSS variable name (e.g. "--color-primary")'),
  value: z.string().min(1).describe('CSS variable value (e.g. "#6366f1")'),
  purpose: z.string().min(1).describe('What this variable is used for'),
});

/** Schema for a planned file in the architecture. */
export const PlannedFileSchema = z.object({
  path: z.string().min(1).regex(PATH_REGEX, 'Path contains invalid characters').describe('File path relative to project root'),
  purpose: z.string().min(1).describe('What this file does'),
  layer: PhaseLayerEnum.describe('Which generation phase produces this file'),
  exports: z.array(z.string()).describe('Named exports this file provides'),
  imports: z.array(z.string()).describe('File paths this file imports from'),
});

/** Schema for the state shape: contexts and hooks planned for the project. */
export const StateShapeSchema = z.object({
  contexts: z.array(z.object({
    name: z.string().min(1).describe('Context name (e.g. "ThemeContext")'),
    stateFields: z.array(z.string()).describe('State field names/types'),
    actions: z.array(z.string()).describe('Action/dispatch function names'),
  })).optional().describe('React contexts to implement'),
  hooks: z.array(z.object({
    name: z.string().min(1).describe('Hook name (e.g. "useTodos")'),
    signature: z.string().min(1).describe('TypeScript signature (e.g. "() => { todos: Todo[]; addTodo: (t: Todo) => void }")'),
    purpose: z.string().min(1).describe('What this hook provides'),
  })).optional().describe('Custom hooks to implement'),
});

/**
 * Full architecture plan produced by the planning phase.
 * Defines the file structure, type contracts, CSS variables,
 * and state shape that all subsequent generation phases must follow.
 */
export const ArchitecturePlanSchema = z.object({
  files: z.array(PlannedFileSchema).min(1).describe('All files to generate with layer assignments'),
  components: z.array(z.string()).describe('React components to implement'),
  dependencies: z.array(z.string()).describe('npm packages to include'),
  routing: z.array(z.string()).describe('Routes to define'),

  typeContracts: z.array(TypeContractSchema).describe('Shared type/interface definitions used across files'),

  cssVariables: z.array(CSSVariableSchema).describe('CSS custom properties for design consistency'),

  stateShape: StateShapeSchema.optional().describe('Planned contexts and hooks for state management'),
});

export type ArchitecturePlan = z.infer<typeof ArchitecturePlanSchema>;
export type PlannedFile = z.infer<typeof PlannedFileSchema>;
export type TypeContract = z.infer<typeof TypeContractSchema>;
export type CSSVariable = z.infer<typeof CSSVariableSchema>;
export type StateShape = z.infer<typeof StateShapeSchema>;

// Plan Review Output Schema
export const PlanReviewSchema = z.object({
  valid: z.preprocess(
    (val) => (typeof val === 'string' ? val === 'true' : val),
    z.boolean()
  ).describe('Whether the architecture plan is internally consistent'),
  issues: z.array(z.object({
    type: z.enum(['dangling_import', 'missing_type', 'wrong_layer', 'circular_dep', 'missing_export']).describe('Type of issue found'),
    file: z.string().describe('Path of the file with the issue'),
    detail: z.string().describe('Description of the problem'),
  })).describe('List of issues found'),
  corrections: z.object({
    filesToAdd: z.array(PlannedFileSchema).describe('New files to inject into the plan'),
    filesToRemove: z.array(z.string()).describe('Paths to remove from the plan'),
    importsToFix: z.array(z.object({
      file: z.string().describe('File containing the broken import'),
      removeImport: z.string().describe('The invalid import path (e.g. "../utils")'),
      addImport: z.string().describe('The corrected import path (e.g. "../shared/utils")'),
    })).describe('Imports to replace across the plan'),
  }).describe('Suggested automatic corrections to the plan'),
});

export type PlanReviewOutput = z.infer<typeof PlanReviewSchema>;
