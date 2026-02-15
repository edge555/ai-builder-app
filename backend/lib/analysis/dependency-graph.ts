/**
 * Dependency Graph Service
 *
 * Builds and queries a dependency graph from the file index.
 * Used to determine which files are affected by changes.
 *
 * Optimized with caching and O(1) import resolution.
 *
 * Requirements: 3.2
 */

import type { FileIndex } from './file-index';
import path from 'path';
import { createHash } from 'crypto';

/**
 * DependencyGraph service for tracking file relationships.
 */
export class DependencyGraph {
  /** Map of file path to files that depend on it (import it) */
  private dependents: Map<string, Set<string>> = new Map();

  /** Map of file path to files it depends on (imports) */
  private dependencies: Map<string, Set<string>> = new Map();

  /** All file paths in the graph */
  private allFiles: Set<string> = new Set();

  /** Cache key for the current graph state */
  private cacheKey: string | null = null;

  /** Pre-computed lookup map for O(1) import resolution */
  private pathLookup: Map<string, string> = new Map();

  /**
   * Build the dependency graph from a file index.
   * Uses caching to avoid rebuilding when files haven't changed.
   */
  build(fileIndex: FileIndex): void {
    const newCacheKey = this.computeCacheKey(fileIndex);

    // Return early if cache is valid
    if (this.cacheKey === newCacheKey && this.cacheKey !== null) {
      return;
    }

    this.dependents.clear();
    this.dependencies.clear();
    this.allFiles.clear();
    this.pathLookup.clear();

    const entries = fileIndex.getAllEntries();

    // First pass: collect all file paths
    for (const entry of entries) {
      this.allFiles.add(entry.filePath);
      this.dependents.set(entry.filePath, new Set());
      this.dependencies.set(entry.filePath, new Set());
    }

    // Build O(1) path lookup map
    this.buildPathLookup();

    // Second pass: build dependency relationships
    for (const entry of entries) {
      for (const importInfo of entry.imports) {
        if (importInfo.isRelative) {
          const resolvedPath = this.resolveImportPath(entry.filePath, importInfo.source);

          if (resolvedPath && this.allFiles.has(resolvedPath)) {
            // entry.filePath depends on resolvedPath
            this.dependencies.get(entry.filePath)?.add(resolvedPath);
            // resolvedPath has entry.filePath as a dependent
            this.dependents.get(resolvedPath)?.add(entry.filePath);
          }
        }
      }
    }

    // Update cache key
    this.cacheKey = newCacheKey;
  }


  /**
   * Get files that depend on (import) the given file.
   * These are files that would be affected if the given file changes.
   */
  getDependents(filePath: string): string[] {
    return Array.from(this.dependents.get(filePath) ?? []);
  }

  /**
   * Get files that the given file depends on (imports).
   */
  getDependencies(filePath: string): string[] {
    return Array.from(this.dependencies.get(filePath) ?? []);
  }

  /**
   * Get all files transitively affected by changes to the given files.
   * This includes the files themselves and all their transitive dependents.
   */
  getAffectedFiles(filePaths: string[]): string[] {
    const affected = new Set<string>();
    const queue = [...filePaths];

    while (queue.length > 0) {
      const current = queue.shift()!;
      
      if (affected.has(current)) {
        continue;
      }
      
      affected.add(current);
      
      // Add all dependents to the queue
      const dependents = this.getDependents(current);
      for (const dependent of dependents) {
        if (!affected.has(dependent)) {
          queue.push(dependent);
        }
      }
    }

    return Array.from(affected);
  }

  /**
   * Compute a cache key from the file index.
   * Key is based on file paths and content hashes.
   */
  private computeCacheKey(fileIndex: FileIndex): string {
    const entries = fileIndex.getAllEntries();

    // Sort entries by file path for deterministic hashing
    const sortedEntries = entries.sort((a, b) => a.filePath.localeCompare(b.filePath));

    // Create a string of "path:hash" pairs
    const keyParts = sortedEntries.map((entry) => `${entry.filePath}:${entry.contentHash}`);

    // Hash the combined string
    return createHash('sha256').update(keyParts.join('|')).digest('hex');
  }

  /**
   * Build a lookup map for O(1) import resolution.
   * Pre-computes all possible file paths with extensions.
   */
  private buildPathLookup(): void {
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

    for (const filePath of this.allFiles) {
      // Remove any existing extensions
      const withoutExt = filePath.replace(/\.(ts|tsx|js|jsx)$/, '');

      // Map all possible import sources to this file path
      for (const ext of extensions) {
        const candidate = withoutExt + ext;
        if (candidate === filePath) {
          this.pathLookup.set(filePath, filePath);
          // Also map without extension
          this.pathLookup.set(withoutExt, filePath);
        }
      }

      // Also check if this is an index file
      if (filePath.match(/\/index\.(ts|tsx|js|jsx)$/)) {
        const dirPath = path.dirname(filePath).replace(/\\/g, '/');
        this.pathLookup.set(dirPath, filePath);
      }

      // Map the file path directly
      this.pathLookup.set(filePath, filePath);
    }
  }

  /**
   * Resolve a relative import path to an absolute project path.
   * Uses pre-computed lookup map for O(1) resolution.
   */
  private resolveImportPath(fromFile: string, importSource: string): string | null {
    const fromDir = path.dirname(fromFile);
    let resolved = path.join(fromDir, importSource);

    // Normalize path separators
    resolved = resolved.replace(/\\/g, '/');

    // Try O(1) lookup first
    if (this.pathLookup.has(resolved)) {
      return this.pathLookup.get(resolved)!;
    }

    // Fallback: try common extensions (for edge cases not in lookup)
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

    for (const ext of extensions) {
      const candidate = resolved + ext;
      if (this.allFiles.has(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Check if a file exists in the graph.
   */
  hasFile(filePath: string): boolean {
    return this.allFiles.has(filePath);
  }

  /**
   * Get all files in the graph.
   */
  getAllFiles(): string[] {
    return Array.from(this.allFiles);
  }
}

/**
 * Build a dependency graph from a file index.
 */
export function buildDependencyGraph(fileIndex: FileIndex): DependencyGraph {
  const graph = new DependencyGraph();
  graph.build(fileIndex);
  return graph;
}
