/**
 * Dependency Graph Service
 * 
 * Builds and queries a dependency graph from the file index.
 * Used to determine which files are affected by changes.
 * 
 * Requirements: 3.2
 */

import type { FileIndex } from './file-index';
import path from 'path';

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

  /**
   * Build the dependency graph from a file index.
   */
  build(fileIndex: FileIndex): void {
    this.dependents.clear();
    this.dependencies.clear();
    this.allFiles.clear();

    const entries = fileIndex.getAllEntries();
    
    // First pass: collect all file paths
    for (const entry of entries) {
      this.allFiles.add(entry.filePath);
      this.dependents.set(entry.filePath, new Set());
      this.dependencies.set(entry.filePath, new Set());
    }

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
   * Resolve a relative import path to an absolute project path.
   */
  private resolveImportPath(fromFile: string, importSource: string): string | null {
    const fromDir = path.dirname(fromFile);
    let resolved = path.join(fromDir, importSource);
    
    // Normalize path separators
    resolved = resolved.replace(/\\/g, '/');
    
    // Try common extensions if not specified
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
