import type { ProjectState, SerializedProjectState } from './project-state';
import type { Version, SerializedVersion } from './version';
import type { FileDiff } from './diff';
import type { ChangeSummary } from './change-summary';
import type { RuntimeError } from './runtime-error';

// ============================================================================
// Generate Project API
// ============================================================================

/**
 * Request body for generating a new project.
 */
export interface GenerateProjectRequest {
  /** Natural language description of the project to generate */
  description: string;
}

/**
 * Response from the generate project endpoint.
 */
export interface GenerateProjectResponse {
  /** Whether the generation was successful */
  success: boolean;
  /** The generated project state (if successful) */
  projectState?: SerializedProjectState;
  /** The initial version (if successful) */
  version?: SerializedVersion;
  /** Error message (if unsuccessful) */
  error?: string;
}

// ============================================================================
// Modify Project API
// ============================================================================

/**
 * Request body for modifying an existing project.
 */
export interface ModifyProjectRequest {
  /** Current state of the project */
  projectState: SerializedProjectState;
  /** Natural language modification prompt */
  prompt: string;
  /** Skip FilePlanner - use provided files directly (when client has already done planning via /api/plan) */
  skipPlanning?: boolean;
  /** Runtime error context for auto-repair (if applicable) */
  runtimeError?: RuntimeError;
}

/**
 * Response from the modify project endpoint.
 */
export interface ModifyProjectResponse {
  /** Whether the modification was successful */
  success: boolean;
  /** The updated project state (if successful) */
  projectState?: SerializedProjectState;
  /** The new version (if successful) */
  version?: SerializedVersion;
  /** Computed diffs from the modification (if successful) */
  diffs?: FileDiff[];
  /** Summary of changes (if successful) */
  changeSummary?: ChangeSummary;
  /** Error message (if unsuccessful) */
  error?: string;
}

// ============================================================================
// Version API
// ============================================================================

/**
 * Request parameters for getting versions.
 */
export interface GetVersionsRequest {
  /** ID of the project to get versions for */
  projectId: string;
}

/**
 * Response from the get versions endpoint.
 */
export interface GetVersionsResponse {
  /** List of all versions for the project */
  versions: SerializedVersion[];
}

// ============================================================================
// Revert API
// ============================================================================

/**
 * Request body for reverting to a specific version.
 */
export interface RevertVersionRequest {
  /** ID of the project */
  projectId: string;
  /** ID of the version to revert to */
  versionId: string;
}

/**
 * Response from the revert endpoint.
 */
export interface RevertVersionResponse {
  /** Whether the revert was successful */
  success: boolean;
  /** The restored project state (if successful) */
  projectState?: SerializedProjectState;
  /** The new version representing the revert (if successful) */
  version?: SerializedVersion;
  /** Error message (if unsuccessful) */
  error?: string;
}

// ============================================================================
// Diff API
// ============================================================================

/**
 * Request body for computing diffs between versions.
 */
export interface ComputeDiffRequest {
  /** ID of the older version */
  fromVersionId: string;
  /** ID of the newer version */
  toVersionId: string;
}

/**
 * Response from the diff endpoint.
 */
export interface ComputeDiffResponse {
  /** Whether the diff computation was successful */
  success: boolean;
  /** Computed diffs (if successful) */
  diffs?: FileDiff[];
  /** Error message (if unsuccessful) */
  error?: string;
}

// ============================================================================
// Export API
// ============================================================================

/**
 * Request body for exporting a project as ZIP.
 */
export interface ExportProjectRequest {
  /** The project state to export */
  projectState: SerializedProjectState;
}

// Response is a binary ZIP file download

/**
 * Standard error shape for all API responses.
 */
export interface ApiError {
  /** Category of the error */
  type: 'ai_output' | 'api' | 'validation' | 'state' | 'unknown';
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: Record<string, unknown>;
  /** Whether the error is recoverable (user can retry) */
  recoverable: boolean;
}

/**
 * Standard error response format for all API endpoints.
 */
export interface ErrorResponse {
  success: false;
  error: ApiError;
}
