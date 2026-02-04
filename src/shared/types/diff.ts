/**
 * Represents the diff for a single file between two versions.
 */
export interface FileDiff {
  /** Path to the file */
  filePath: string;
  /** Status of the file change */
  status: 'added' | 'modified' | 'deleted';
  /** Array of diff hunks containing the actual changes */
  hunks: DiffHunk[];
}

/**
 * Represents a contiguous block of changes in a file.
 */
export interface DiffHunk {
  /** Starting line number in the old file */
  oldStart: number;
  /** Number of lines in the old file */
  oldLines: number;
  /** Starting line number in the new file */
  newStart: number;
  /** Number of lines in the new file */
  newLines: number;
  /** Array of individual line changes */
  changes: DiffChange[];
}

/**
 * Represents a single line change within a diff hunk.
 */
export interface DiffChange {
  /** Type of change: add, delete, or context (unchanged) */
  type: 'add' | 'delete' | 'context';
  /** Line number in the respective file */
  lineNumber: number;
  /** Content of the line */
  content: string;
}
