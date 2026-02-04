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
    const exports = this.parseExports(content);
    const imports = this.parseImports(content);
    const components = this.parseComponents(content);
    const functions = this.parseFunctions(content);

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

  /**
   * Parse exports from file content.
   */
  private parseExports(content: string): ExportInfo[] {
    const exports: ExportInfo[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      // Default export: export default function/const/class Name
      const defaultFuncMatch = line.match(/export\s+default\s+function\s+(\w+)/);
      if (defaultFuncMatch) {
        exports.push({
          name: defaultFuncMatch[1],
          type: 'default',
          kind: this.isComponentName(defaultFuncMatch[1]) ? 'component' : 'function',
        });
        continue;
      }

      // Default export: export default Name (for classes/components)
      const defaultMatch = line.match(/export\s+default\s+(\w+)/);
      if (defaultMatch && !line.includes('function')) {
        exports.push({
          name: defaultMatch[1],
          type: 'default',
          kind: this.isComponentName(defaultMatch[1]) ? 'component' : 'constant',
        });
        continue;
      }

      // Named export: export function Name
      const namedFuncMatch = line.match(/export\s+function\s+(\w+)/);
      if (namedFuncMatch) {
        exports.push({
          name: namedFuncMatch[1],
          type: 'named',
          kind: this.isComponentName(namedFuncMatch[1]) ? 'component' : 'function',
        });
        continue;
      }

      // Named export: export const Name
      const namedConstMatch = line.match(/export\s+const\s+(\w+)/);
      if (namedConstMatch) {
        exports.push({
          name: namedConstMatch[1],
          type: 'named',
          kind: this.isComponentName(namedConstMatch[1]) ? 'component' : 'constant',
        });
        continue;
      }

      // Named export: export interface Name
      const interfaceMatch = line.match(/export\s+interface\s+(\w+)/);
      if (interfaceMatch) {
        exports.push({
          name: interfaceMatch[1],
          type: 'named',
          kind: 'interface',
        });
        continue;
      }

      // Named export: export type Name
      const typeMatch = line.match(/export\s+type\s+(\w+)/);
      if (typeMatch) {
        exports.push({
          name: typeMatch[1],
          type: 'named',
          kind: 'type',
        });
        continue;
      }

      // Re-exports: export { Name1, Name2 } from './module'
      const reExportMatch = line.match(/export\s*\{([^}]+)\}/);
      if (reExportMatch) {
        const names = reExportMatch[1].split(',').map(n => n.trim().split(/\s+as\s+/).pop()!.trim());
        for (const name of names) {
          if (name) {
            exports.push({
              name,
              type: 'named',
              kind: 'constant',
            });
          }
        }
      }
    }

    return exports;
  }


  /**
   * Parse imports from file content.
   */
  private parseImports(content: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      // Standard import: import { a, b } from 'module'
      const namedImportMatch = line.match(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/);
      if (namedImportMatch) {
        const specifiers = namedImportMatch[1]
          .split(',')
          .map(s => s.trim().split(/\s+as\s+/)[0].trim())
          .filter(Boolean);
        imports.push({
          source: namedImportMatch[2],
          specifiers,
          isRelative: namedImportMatch[2].startsWith('.'),
        });
        continue;
      }

      // Default import: import Name from 'module'
      const defaultImportMatch = line.match(/import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/);
      if (defaultImportMatch) {
        imports.push({
          source: defaultImportMatch[2],
          specifiers: [defaultImportMatch[1]],
          isRelative: defaultImportMatch[2].startsWith('.'),
        });
        continue;
      }

      // Mixed import: import Name, { a, b } from 'module'
      const mixedImportMatch = line.match(/import\s+(\w+)\s*,\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/);
      if (mixedImportMatch) {
        const namedSpecifiers = mixedImportMatch[2]
          .split(',')
          .map(s => s.trim().split(/\s+as\s+/)[0].trim())
          .filter(Boolean);
        imports.push({
          source: mixedImportMatch[3],
          specifiers: [mixedImportMatch[1], ...namedSpecifiers],
          isRelative: mixedImportMatch[3].startsWith('.'),
        });
        continue;
      }

      // Namespace import: import * as Name from 'module'
      const namespaceImportMatch = line.match(/import\s*\*\s*as\s+(\w+)\s+from\s*['"]([^'"]+)['"]/);
      if (namespaceImportMatch) {
        imports.push({
          source: namespaceImportMatch[2],
          specifiers: [namespaceImportMatch[1]],
          isRelative: namespaceImportMatch[2].startsWith('.'),
        });
        continue;
      }

      // Side-effect import: import 'module'
      const sideEffectMatch = line.match(/import\s*['"]([^'"]+)['"]/);
      if (sideEffectMatch && !line.includes('from')) {
        imports.push({
          source: sideEffectMatch[1],
          specifiers: [],
          isRelative: sideEffectMatch[1].startsWith('.'),
        });
      }
    }

    return imports;
  }

  /**
   * Parse React components from file content.
   */
  private parseComponents(content: string): ComponentInfo[] {
    const components: ComponentInfo[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Function component: function ComponentName or const ComponentName = 
      const funcComponentMatch = line.match(/(?:export\s+)?(?:function|const)\s+([A-Z]\w*)/);
      if (funcComponentMatch && this.isComponentName(funcComponentMatch[1])) {
        // Check if it returns JSX (look for < in subsequent lines)
        const componentEnd = this.findComponentEnd(lines, i);
        const componentBody = lines.slice(i, componentEnd + 1).join('\n');
        
        if (this.containsJSX(componentBody)) {
          const props = this.extractProps(line, lines, i);
          components.push({
            name: funcComponentMatch[1],
            props,
            startLine: i + 1,
            endLine: componentEnd + 1,
          });
        }
      }
    }

    return components;
  }

  /**
   * Parse functions from file content.
   */
  private parseFunctions(content: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Function declaration: function name(params)
      const funcDeclMatch = line.match(/(?:export\s+)?function\s+(\w+)\s*\(([^)]*)\)/);
      if (funcDeclMatch) {
        const name = funcDeclMatch[1];
        // Skip if it's a component (starts with uppercase)
        if (!this.isComponentName(name)) {
          const params = this.parseParams(funcDeclMatch[2]);
          const endLine = this.findFunctionEnd(lines, i);
          functions.push({
            name,
            params,
            startLine: i + 1,
            endLine: endLine + 1,
          });
        }
        continue;
      }

      // Arrow function: const name = (params) =>
      const arrowFuncMatch = line.match(/(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*\w+)?\s*=>/);
      if (arrowFuncMatch) {
        const name = arrowFuncMatch[1];
        // Skip if it's a component (starts with uppercase)
        if (!this.isComponentName(name)) {
          const params = this.parseParams(arrowFuncMatch[2]);
          const endLine = this.findFunctionEnd(lines, i);
          functions.push({
            name,
            params,
            startLine: i + 1,
            endLine: endLine + 1,
          });
        }
      }
    }

    return functions;
  }

  /**
   * Check if a name follows React component naming convention (PascalCase).
   */
  private isComponentName(name: string): boolean {
    return /^[A-Z][a-zA-Z0-9]*$/.test(name);
  }

  /**
   * Check if content contains JSX.
   */
  private containsJSX(content: string): boolean {
    // Look for JSX patterns: <Component, <div, etc.
    return /<[A-Za-z][^>]*>/.test(content) || /return\s*\(?\s*</.test(content);
  }

  /**
   * Find the end line of a component or function.
   */
  private findComponentEnd(lines: string[], startLine: number): number {
    let braceCount = 0;
    let started = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          started = true;
        } else if (char === '}') {
          braceCount--;
        }
      }

      if (started && braceCount === 0) {
        return i;
      }
    }

    return lines.length - 1;
  }

  /**
   * Find the end line of a function.
   */
  private findFunctionEnd(lines: string[], startLine: number): number {
    return this.findComponentEnd(lines, startLine);
  }

  /**
   * Extract props from a component definition.
   */
  private extractProps(line: string, lines: string[], lineIndex: number): string[] {
    // Look for destructured props: { prop1, prop2 }
    const propsMatch = line.match(/\(\s*\{\s*([^}]+)\s*\}/);
    if (propsMatch) {
      return propsMatch[1]
        .split(',')
        .map(p => p.trim().split(/[=:]/)[0].trim())
        .filter(Boolean);
    }

    // Look for typed props: (props: PropsType)
    const typedPropsMatch = line.match(/\(\s*(\w+)\s*:/);
    if (typedPropsMatch) {
      return [typedPropsMatch[1]];
    }

    return [];
  }

  /**
   * Parse function parameters.
   */
  private parseParams(paramsStr: string): string[] {
    if (!paramsStr.trim()) return [];
    
    return paramsStr
      .split(',')
      .map(p => {
        // Handle destructured params: { a, b }
        const destructuredMatch = p.match(/\{\s*([^}]+)\s*\}/);
        if (destructuredMatch) {
          return destructuredMatch[1].split(',').map(s => s.trim().split(/[=:]/)[0].trim());
        }
        // Handle regular params: name: type = default
        return p.trim().split(/[=:]/)[0].trim();
      })
      .flat()
      .filter(Boolean);
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
