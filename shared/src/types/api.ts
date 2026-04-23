import type { SerializedProjectState } from './project-state';
import type { SerializedVersion } from './version';
import type { FileDiff } from './diff';
import type { ChangeSummary } from './change-summary';
import type { RuntimeError } from './runtime-error';

// ============================================================================
// Generate Project API
// ============================================================================

/**
 * An image attachment uploaded by the user (e.g., a logo or screenshot).
 */
export interface ImageAttachment {
  /** Public URL of the uploaded image (from Supabase Storage) */
  url: string;
  /** MIME type of the image */
  type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  /** Alt text for the image (sanitized, max 200 chars) */
  alt?: string;
}

/**
 * Request body for generating a new project.
 */
export interface GenerateProjectRequest {
  /** Natural language description of the project to generate */
  description: string;
  /** Optional image attachments (uploaded via /api/upload) */
  attachments?: ImageAttachment[];
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
  /** Error category for retry behavior and UI messaging */
  errorType?: ApiError['type'];
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
  shouldSkipPlanning?: boolean;
  /** Runtime error context for auto-repair (if applicable) */
  runtimeError?: RuntimeError;
  /** Optional image attachments (uploaded via /api/upload) */
  attachments?: ImageAttachment[];
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
  /** Error category for retry behavior and UI messaging */
  errorType?: ApiError['type'];
  /** True when some files were modified but others had to be rolled back */
  partialSuccess?: boolean;
  /** Files that were rolled back to their pre-modification state */
  rolledBackFiles?: string[];
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
  type: 'ai_output' | 'api' | 'validation' | 'state' | 'timeout' | 'rate_limit' | 'unknown';
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
 * Common error codes for API errors.
 */
export const ERROR_CODES = {
  // Timeout errors
  TIMEOUT: 'TIMEOUT',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',

  // Rate limit errors
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',

  // API errors
  API_ERROR: 'API_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  CANCELLED: 'CANCELLED',

  // Validation errors
  VALIDATION_FAILED: 'VALIDATION_FAILED',

  // AI output errors
  GENERATION_FAILED: 'GENERATION_FAILED',

  // State errors
  STATE_ERROR: 'STATE_ERROR',

  // Unknown errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

/**
 * Standard error response format for all API endpoints.
 */
export interface ErrorResponse {
  success: false;
  error: ApiError;
}
