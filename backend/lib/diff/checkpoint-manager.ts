/**
 * @module diff/checkpoint-manager
 * @description Captures pre-modification file contents for per-file rollback.
 * Used by DiagnosticRepairEngine to revert still-broken files.
 */

export class CheckpointManager {
  private snapshots: Record<string, string> = {};

  /**
   * Capture file contents before modification.
   * Only captures files that exist in the source.
   */
  capture(files: Record<string, string>, filePaths: string[]): void {
    for (const path of filePaths) {
      if (files[path] !== undefined) {
        this.snapshots[path] = files[path];
      }
    }
  }

  /**
   * Rollback a single file to its captured content.
   * Returns null if the file was never captured.
   */
  rollback(filePath: string): string | null {
    return this.snapshots[filePath] ?? null;
  }

  /**
   * Rollback all captured files. Returns a copy of the snapshot map.
   */
  rollbackAll(): Record<string, string> {
    return { ...this.snapshots };
  }

  /**
   * Check if a file was captured.
   */
  has(filePath: string): boolean {
    return filePath in this.snapshots;
  }
}
