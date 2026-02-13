/**
 * File Index Service
 * 
 * Indexes project files to track components, functions, exports, and imports.
 * Used for context-aware code slicing during modifications.
 * 
 * Requirements: 3.1
 */

import type {
  FileIndexEntry,
  ExportInfo,
  ImportInfo,
  ComponentInfo,
  FunctionInfo,
} from '@ai-app-builder/shared';
import type { ProjectState } from '@ai-app-builder/shared';
import {
  parseExports,
  parseImports,
  parseComponents,
  parseFunctions,
} from './file-index-parsers';

/**
 * FileIndex service for indexing and querying project files.
 */
export class FileIndex {
  private entries: Map<string, FileIndexEntry> = new Map();

  /**
   * Index all files in a project state.
   */
  index(projectState: ProjectState): void {
    this.entries.clear();
    
    for (const [filePath, content] of Object.entries(projectState.files)) {
      const entry = this.parseFile(filePath, content);
      this.entries.set(filePath, entry);
    }
  }

  /**
   * Search for files matching a query string.
   */
  search(query: string): FileIndexEntry[] {
    const results: FileIndexEntry[] = [];
    const lowerQuery = query.toLowerCase();
    
    for (const entry of this.entries.values()) {
      // Match file path
      if (entry.filePath.toLowerCase().includes(lowerQuery)) {
        results.push(entry);
        continue;
      }
      
      // Match component names
      if (entry.components.some(c => c.name.toLowerCase().includes(lowerQuery))) {
        results.push(entry);
        continue;
      }
      
      // Match function names
      if (entry.functions.some(f => f.name.toLowerCase().includes(lowerQuery))) {
        results.push(entry);
        continue;
      }

      
      // Match export names
      if (entry.exports.some(e => e.name.toLowerCase().includes(lowerQuery))) {
        results.push(entry);
      }
    }
    
    return results;
  }

  /**
   * Get the index entry for a specific file.
   */
  getEntry(filePath: string): FileIndexEntry | null {
    return this.entries.get(filePath) ?? null;
  }

  /**
   * Get all exports from a file.
   */
  getExports(filePath: string): ExportInfo[] {
    return this.entries.get(filePath)?.exports ?? [];
  }

  /**
   * Get all imports from a file.
   */
  getImports(filePath: string): ImportInfo[] {
    return this.entries.get(filePath)?.imports ?? [];
  }

  /**
   * Get all indexed entries.
   */
  getAllEntries(): FileIndexEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Parse a single file and extract metadata.
   */
  private parseFile(filePath: string, content: string): FileIndexEntry {
    const fileType = this.determineFileType(filePath);
    const exports = parseExports(content);
    const imports = parseImports(content);
    const components = parseComponents(content);
    const functions = parseFunctions(content);

    return {
      filePath,
      fileType,
      exports,
      imports,
      components,
      functions,
    };
  }

  /**
   * Determine the type of file based on path and content patterns.
   */
  private determineFileType(filePath: string): FileIndexEntry['fileType'] {
    const lowerPath = filePath.toLowerCase();
    
    // Config files
    if (
      lowerPath.endsWith('.config.ts') ||
      lowerPath.endsWith('.config.js') ||
      lowerPath.includes('tsconfig') ||
      lowerPath.includes('package.json')
    ) {
      return 'config';
    }
    
    // Style files
    if (lowerPath.endsWith('.css') || lowerPath.endsWith('.scss') || lowerPath.endsWith('.less')) {
      return 'style';
    }
    
    // API routes (Next.js convention)
    if (lowerPath.includes('/api/') && lowerPath.includes('route.')) {
      return 'api_route';
    }
    
    // Hooks (React convention)
    if (lowerPath.includes('/hooks/') || /use[A-Z]/.test(filePath)) {
      return 'hook';
    }
    
    // Components (check for JSX patterns or component directory)
    if (
      lowerPath.includes('/components/') ||
      lowerPath.endsWith('.tsx') ||
      lowerPath.endsWith('.jsx')
    ) {
      return 'component';
    }
    
    // Utility files
    if (lowerPath.includes('/utils/') || lowerPath.includes('/lib/') || lowerPath.includes('/helpers/')) {
      return 'utility';
    }
    
    return 'other';
  }

}

/**
 * Create and index a project state.
 */
export function indexProject(projectState: ProjectState): FileIndex {
  const fileIndex = new FileIndex();
  fileIndex.index(projectState);
  return fileIndex;
}
