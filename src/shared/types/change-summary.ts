/**
 * Human-readable summary of changes between versions.
 */
export interface ChangeSummary {
  /** Number of files added */
  filesAdded: number;
  /** Number of files modified */
  filesModified: number;
  /** Number of files deleted */
  filesDeleted: number;
  /** Total number of lines added */
  linesAdded: number;
  /** Total number of lines deleted */
  linesDeleted: number;
  /** Human-readable description of the changes */
  description: string;
  /** List of affected file paths */
  affectedFiles: string[];
}
