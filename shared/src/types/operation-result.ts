import type { ProjectState } from './project-state';
import type { Version } from './version';
import type { ValidationError } from './validation';
import type { FileDiff } from './diff';
import type { ChangeSummary } from './change-summary';

/**
 * Base result type for all AI operations (generation, modification, etc.).
 * Consolidates common fields from GenerationResult, StreamingGenerationResult, and ModificationResult.
 */
export interface OperationResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** The resulting project state (if successful) */
  projectState?: ProjectState;
  /** The version created by this operation (if successful) */
  version?: Version;
  /** Error message (if operation failed) */
  error?: string;
  /** Validation errors encountered during the operation */
  validationErrors?: ValidationError[];
}

/**
 * Result of a modification operation.
 * Extends OperationResult with modification-specific fields.
 */
export interface ModificationResult extends OperationResult {
  /** File-level diffs showing what changed */
  diffs?: FileDiff[];
  /** Human-readable summary of changes */
  changeSummary?: ChangeSummary;
  /** True when some files were modified but others had to be rolled back */
  partialSuccess?: boolean;
  /** Files that were rolled back to their pre-modification state */
  rolledBackFiles?: string[];
}
