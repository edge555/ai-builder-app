// ============================================================================
// File Metadata Types
// ============================================================================

/**
 * Type of file in the project.
 */
export type FileType = 'component' | 'style' | 'config' | 'utility' | 'hook' | 'api_route' | 'other';

/**
 * Compact metadata for a single file (no content).
 * Used for planning without sending full file contents.
 */
export interface FileMetadataEntry {
  /** File path relative to project root */
  path: string;
  /** Type of file */
  fileType: FileType;
  /** Number of lines in the file */
  lineCount: number;
  /** Exported symbol names (not full signatures) */
  exports: string[];
  /** Relative import sources (project files only, not node_modules) */
  imports: string[];
}

/**
 * Complete file tree metadata for a project.
 * Array of FileMetadataEntry objects representing the entire project structure.
 */
export type FileTreeMetadata = FileMetadataEntry[];

// ============================================================================
// Plan Project API
// ============================================================================

/**
 * Request body for the plan endpoint.
 * Sends compact metadata instead of full file contents.
 */
export interface PlanProjectRequest {
  /** Compact metadata for all project files */
  fileTreeMetadata: FileTreeMetadata;
  /** Project name for context */
  projectName: string;
  /** Project description for context */
  projectDescription?: string;
  /** Natural language modification prompt */
  prompt: string;
}

/**
 * Metadata about the planning operation.
 */
export interface PlanningMetadata {
  /** Time taken for planning in milliseconds */
  planningTimeMs: number;
  /** Total files in project */
  totalFiles: number;
  /** Number of primary files selected */
  primaryFileCount: number;
  /** Number of context files selected */
  contextFileCount: number;
}

/**
 * Response from the plan endpoint.
 */
export interface PlanProjectResponse {
  /** Whether planning was successful */
  success: boolean;
  /** Files that need modification (full content required) */
  primaryFiles?: string[];
  /** Files needed for context (reference only) */
  contextFiles?: string[];
  /** Whether fallback heuristics were used instead of AI */
  usedFallback?: boolean;
  /** AI's reasoning for file selection */
  reasoning?: string;
  /** Planning metadata */
  metadata?: PlanningMetadata;
  /** Error message if unsuccessful */
  error?: string;
}
