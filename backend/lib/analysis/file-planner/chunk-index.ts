/**
 * Chunk Index Builder
 *
 * Parses project files into discrete code chunks using regex patterns.
 * Extracts functions, components, classes, interfaces, types, and constants.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 10.3, 10.4
 */

import type { ProjectState } from '@ai-app-builder/shared';
import type {
  CodeChunk,
  ChunkIndex,
  ChunkType,
  FileMetadata,
  FileType,
  ExportInfo,
} from './types';

/** File extensions that should be parsed for code chunks */
const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/**
 * ChunkIndexBuilder parses project files into discrete code chunks.
 */
export class ChunkIndexBuilder {
  /**
   * Build chunk index from project state.
   * Parses .ts/.tsx/.js/.jsx files into chunks.
   */
  build(projectState: ProjectState): ChunkIndex {
    const chunks = new Map<string, CodeChunk>();
    const chunksByFile = new Map<string, CodeChunk[]>();
    const fileMetadata = new Map<string, FileMetadata>();

    for (const [filePath, content] of Object.entries(projectState.files)) {
      const isCodeFile = this.isCodeFile(filePath);
      const lineCount = content.split('\n').length;
      const fileType = this.determineFileType(filePath, content);

      if (isCodeFile) {
        const fileChunks = this.parseFile(filePath, content);
        chunksByFile.set(filePath, fileChunks);

        for (const chunk of fileChunks) {
          chunks.set(chunk.id, chunk);
        }

        // Also create metadata for code files
        const exports = this.extractExportInfo(fileChunks);
        fileMetadata.set(filePath, {
          filePath,
          fileType,
          lineCount,
          exports,
        });
      } else {
        // Non-code files get metadata only, no chunks
        fileMetadata.set(filePath, {
          filePath,
          fileType,
          lineCount,
          exports: [],
        });
      }
    }

    return { chunks, chunksByFile, fileMetadata };
  }


  /**
   * Check if a file is a code file that should be parsed.
   */
  private isCodeFile(filePath: string): boolean {
    const lowerPath = filePath.toLowerCase();
    return CODE_EXTENSIONS.some((ext) => lowerPath.endsWith(ext));
  }

  /**
   * Determine the type of file based on path and content patterns.
   */
  private determineFileType(filePath: string, content: string): FileType {
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
    if (
      lowerPath.endsWith('.css') ||
      lowerPath.endsWith('.scss') ||
      lowerPath.endsWith('.less')
    ) {
      return 'style';
    }

    // API routes (Next.js convention)
    if (lowerPath.includes('/api/') && lowerPath.includes('route.')) {
      return 'api_route';
    }

    // Components (check for JSX patterns or component directory)
    if (
      lowerPath.includes('/components/') ||
      lowerPath.endsWith('.tsx') ||
      lowerPath.endsWith('.jsx')
    ) {
      // Verify it actually contains JSX
      if (this.containsJSX(content)) {
        return 'component';
      }
    }

    // Utility files
    if (
      lowerPath.includes('/utils/') ||
      lowerPath.includes('/lib/') ||
      lowerPath.includes('/helpers/')
    ) {
      return 'utility';
    }

    return 'other';
  }

  /**
   * Check if content contains JSX.
   */
  private containsJSX(content: string): boolean {
    return /<[A-Za-z][^>]*>/.test(content) || /return\s*\(?\s*</.test(content);
  }

  /**
   * Extract chunks from a single file.
   */
  parseFile(filePath: string, content: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');
    const imports = this.parseImports(content);
    const exportedSymbols = this.getExportedSymbols(content);
    const processedLines = new Set<number>();

    // Extract interfaces
    const interfaces = this.extractInterfaces(filePath, lines, imports, exportedSymbols);
    for (const chunk of interfaces) {
      for (let i = chunk.startLine - 1; i < chunk.endLine; i++) processedLines.add(i);
    }
    chunks.push(...interfaces);

    // Extract type aliases
    const types = this.extractTypes(filePath, lines, imports, exportedSymbols);
    for (const chunk of types) {
      for (let i = chunk.startLine - 1; i < chunk.endLine; i++) processedLines.add(i);
    }
    chunks.push(...types);

    // Extract classes
    const classes = this.extractClasses(filePath, lines, imports, exportedSymbols);
    for (const chunk of classes) {
      for (let i = chunk.startLine - 1; i < chunk.endLine; i++) processedLines.add(i);
    }
    chunks.push(...classes);

    // Extract functions and arrow functions (including components)
    const functions = this.extractFunctions(filePath, lines, imports, exportedSymbols);
    for (const chunk of functions) {
      for (let i = chunk.startLine - 1; i < chunk.endLine; i++) processedLines.add(i);
    }
    chunks.push(...functions);

    // Extract constants (non-function) - skip lines already processed
    chunks.push(...this.extractConstants(filePath, lines, imports, exportedSymbols, processedLines));

    return chunks;
  }


  /**
   * Parse import statements to track dependencies.
   */
  private parseImports(content: string): Map<string, string[]> {
    const imports = new Map<string, string[]>();
    const lines = content.split('\n');

    for (const line of lines) {
      // Named import: import { a, b } from 'module'
      const namedMatch = line.match(
        /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/
      );
      if (namedMatch) {
        const specifiers = namedMatch[1]
          .split(',')
          .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
          .filter(Boolean);
        imports.set(namedMatch[2], specifiers);
        continue;
      }

      // Default import: import Name from 'module'
      const defaultMatch = line.match(
        /import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/
      );
      if (defaultMatch) {
        imports.set(defaultMatch[2], [defaultMatch[1]]);
        continue;
      }

      // Mixed import: import Name, { a, b } from 'module'
      const mixedMatch = line.match(
        /import\s+(\w+)\s*,\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/
      );
      if (mixedMatch) {
        const namedSpecifiers = mixedMatch[2]
          .split(',')
          .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
          .filter(Boolean);
        imports.set(mixedMatch[3], [mixedMatch[1], ...namedSpecifiers]);
        continue;
      }

      // Namespace import: import * as Name from 'module'
      const namespaceMatch = line.match(
        /import\s*\*\s*as\s+(\w+)\s+from\s*['"]([^'"]+)['"]/
      );
      if (namespaceMatch) {
        imports.set(namespaceMatch[2], [namespaceMatch[1]]);
      }
    }

    return imports;
  }

  /**
   * Get all exported symbol names from content.
   */
  private getExportedSymbols(content: string): Set<string> {
    const exported = new Set<string>();
    const lines = content.split('\n');

    for (const line of lines) {
      // export function/const/class/interface/type Name
      const directExport = line.match(
        /export\s+(?:default\s+)?(?:function|const|class|interface|type)\s+(\w+)/
      );
      if (directExport) {
        exported.add(directExport[1]);
        continue;
      }

      // export default Name
      const defaultExport = line.match(/export\s+default\s+(\w+)/);
      if (defaultExport && !line.includes('function') && !line.includes('class')) {
        exported.add(defaultExport[1]);
        continue;
      }

      // export { Name1, Name2 }
      const namedExport = line.match(/export\s*\{([^}]+)\}/);
      if (namedExport) {
        const names = namedExport[1]
          .split(',')
          .map((n) => n.trim().split(/\s+as\s+/)[0].trim())
          .filter(Boolean);
        names.forEach((n) => exported.add(n));
      }
    }

    return exported;
  }


  /**
   * Extract interface declarations.
   */
  private extractInterfaces(
    filePath: string,
    lines: string[],
    imports: Map<string, string[]>,
    exportedSymbols: Set<string>
  ): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+[\w,\s<>]+)?/);

      if (match) {
        const symbolName = match[1];
        const startLine = i + 1;
        const endLine = this.findBlockEnd(lines, i) + 1;
        const content = lines.slice(i, endLine).join('\n');
        const signature = this.extractSignature(content, 'interface');
        const dependencies = this.findDependencies(content, imports);

        chunks.push({
          id: `${filePath}#${symbolName}`,
          filePath,
          symbolName,
          chunkType: 'interface',
          startLine,
          endLine,
          content,
          signature,
          dependencies,
          isExported: exportedSymbols.has(symbolName) || line.includes('export'),
        });
      }
    }

    return chunks;
  }

  /**
   * Extract type alias declarations.
   */
  private extractTypes(
    filePath: string,
    lines: string[],
    imports: Map<string, string[]>,
    exportedSymbols: Set<string>
  ): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/(?:export\s+)?type\s+(\w+)(?:<[^>]+>)?\s*=/);

      if (match) {
        const symbolName = match[1];
        const startLine = i + 1;
        const endLine = this.findTypeEnd(lines, i) + 1;
        const content = lines.slice(i, endLine).join('\n');
        const signature = this.extractSignature(content, 'type');
        const dependencies = this.findDependencies(content, imports);

        chunks.push({
          id: `${filePath}#${symbolName}`,
          filePath,
          symbolName,
          chunkType: 'type',
          startLine,
          endLine,
          content,
          signature,
          dependencies,
          isExported: exportedSymbols.has(symbolName) || line.includes('export'),
        });
      }
    }

    return chunks;
  }

  /**
   * Extract class declarations.
   */
  private extractClasses(
    filePath: string,
    lines: string[],
    imports: Map<string, string[]>,
    exportedSymbols: Set<string>
  ): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(
        /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w,\s]+)?/
      );

      if (match) {
        const symbolName = match[1];
        const startLine = i + 1;
        const endLine = this.findBlockEnd(lines, i) + 1;
        const content = lines.slice(i, endLine).join('\n');
        const signature = this.extractSignature(content, 'class');
        const dependencies = this.findDependencies(content, imports);

        chunks.push({
          id: `${filePath}#${symbolName}`,
          filePath,
          symbolName,
          chunkType: 'class',
          startLine,
          endLine,
          content,
          signature,
          dependencies,
          isExported: exportedSymbols.has(symbolName) || line.includes('export'),
        });
      }
    }

    return chunks;
  }


  /**
   * Extract function declarations and arrow functions (including React components).
   */
  private extractFunctions(
    filePath: string,
    lines: string[],
    imports: Map<string, string[]>,
    exportedSymbols: Set<string>
  ): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const processedLines = new Set<number>();

    for (let i = 0; i < lines.length; i++) {
      if (processedLines.has(i)) continue;

      const line = lines[i];

      // Function declaration: function name(params)
      const funcMatch = line.match(
        /(?:export\s+)?(?:export\s+default\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]+>)?\s*\(/
      );
      if (funcMatch) {
        const symbolName = funcMatch[1];
        const startLine = i + 1;
        const endLine = this.findBlockEnd(lines, i) + 1;
        const content = lines.slice(i, endLine).join('\n');
        const isComponent = this.isComponentName(symbolName) && this.containsJSX(content);
        const chunkType: ChunkType = isComponent ? 'component' : 'function';
        const signature = this.extractSignature(content, chunkType);
        const dependencies = this.findDependencies(content, imports);

        chunks.push({
          id: `${filePath}#${symbolName}`,
          filePath,
          symbolName,
          chunkType,
          startLine,
          endLine,
          content,
          signature,
          dependencies,
          isExported: exportedSymbols.has(symbolName) || line.includes('export'),
        });

        for (let j = i; j < endLine; j++) processedLines.add(j);
        continue;
      }

      // Arrow function: const name = (params) => or const name = async (params) =>
      const arrowMatch = line.match(
        /(?:export\s+)?const\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s*)?\(/
      );
      if (arrowMatch) {
        // Check if this is actually an arrow function (look for =>)
        const startLine = i + 1;
        const endLine = this.findBlockEnd(lines, i) + 1;
        const content = lines.slice(i, endLine).join('\n');

        if (content.includes('=>')) {
          const symbolName = arrowMatch[1];
          const isComponent = this.isComponentName(symbolName) && this.containsJSX(content);
          const chunkType: ChunkType = isComponent ? 'component' : 'function';
          const signature = this.extractSignature(content, chunkType);
          const dependencies = this.findDependencies(content, imports);

          chunks.push({
            id: `${filePath}#${symbolName}`,
            filePath,
            symbolName,
            chunkType,
            startLine,
            endLine,
            content,
            signature,
            dependencies,
            isExported: exportedSymbols.has(symbolName) || line.includes('export'),
          });

          for (let j = i; j < endLine; j++) processedLines.add(j);
        }
      }
    }

    return chunks;
  }

  /**
   * Extract constant declarations (non-function).
   */
  private extractConstants(
    filePath: string,
    lines: string[],
    imports: Map<string, string[]>,
    exportedSymbols: Set<string>,
    processedLines: Set<number>
  ): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const processedSymbols = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      // Skip lines already processed by other extractors
      if (processedLines.has(i)) continue;

      const line = lines[i];

      // const name = value (not a function)
      const constMatch = line.match(/(?:export\s+)?const\s+(\w+)\s*(?::\s*[^=]+)?\s*=/);
      if (constMatch) {
        const symbolName = constMatch[1];

        // Skip if already processed (likely a function)
        if (processedSymbols.has(symbolName)) continue;

        const startLine = i + 1;
        const endLine = this.findConstantEnd(lines, i) + 1;
        const content = lines.slice(i, endLine).join('\n');

        // Skip if this is an arrow function
        if (content.includes('=>') && content.match(/=\s*(?:async\s*)?\(/)) {
          continue;
        }

        const signature = this.extractSignature(content, 'constant');
        const dependencies = this.findDependencies(content, imports);

        chunks.push({
          id: `${filePath}#${symbolName}`,
          filePath,
          symbolName,
          chunkType: 'constant',
          startLine,
          endLine,
          content,
          signature,
          dependencies,
          isExported: exportedSymbols.has(symbolName) || line.includes('export'),
        });

        processedSymbols.add(symbolName);
      }
    }

    return chunks;
  }


  /**
   * Check if a name follows React component naming convention (PascalCase).
   */
  private isComponentName(name: string): boolean {
    return /^[A-Z][a-zA-Z0-9]*$/.test(name);
  }

  /**
   * Find the end of a block (matching braces).
   */
  private findBlockEnd(lines: string[], startLine: number): number {
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
   * Find the end of a type alias (may span multiple lines).
   */
  private findTypeEnd(lines: string[], startLine: number): number {
    let parenCount = 0;
    let braceCount = 0;
    let angleCount = 0;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];

      for (const char of line) {
        if (char === '(') parenCount++;
        else if (char === ')') parenCount--;
        else if (char === '{') braceCount++;
        else if (char === '}') braceCount--;
        else if (char === '<') angleCount++;
        else if (char === '>') angleCount--;
      }

      // Type ends when we hit a semicolon and all brackets are balanced
      if (
        line.includes(';') &&
        parenCount === 0 &&
        braceCount === 0 &&
        angleCount <= 0
      ) {
        return i;
      }
    }

    return lines.length - 1;
  }

  /**
   * Find the end of a constant declaration.
   */
  private findConstantEnd(lines: string[], startLine: number): number {
    let parenCount = 0;
    let braceCount = 0;
    let bracketCount = 0;
    let templateCount = 0;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];

      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '(') parenCount++;
        else if (char === ')') parenCount--;
        else if (char === '{') braceCount++;
        else if (char === '}') braceCount--;
        else if (char === '[') bracketCount++;
        else if (char === ']') bracketCount--;
        else if (char === '`') templateCount = templateCount === 0 ? 1 : 0;
      }

      // Constant ends when we hit a semicolon or newline and all brackets are balanced
      const isBalanced =
        parenCount === 0 &&
        braceCount === 0 &&
        bracketCount === 0 &&
        templateCount === 0;

      if (isBalanced && (line.includes(';') || (i > startLine && !line.trim().startsWith('.')))) {
        return i;
      }
    }

    return lines.length - 1;
  }


  /**
   * Extract signature (declaration without body) from chunk content.
   */
  extractSignature(content: string, chunkType: ChunkType): string {
    const lines = content.split('\n');
    const firstLine = lines[0].trim();

    switch (chunkType) {
      case 'interface': {
        // For interfaces, include the full declaration (they're usually type-only)
        // But truncate if very long
        if (content.length < 500) {
          return content;
        }
        // Return first few lines with ellipsis
        const signatureLines = lines.slice(0, 5);
        return signatureLines.join('\n') + '\n  // ...';
      }

      case 'type': {
        // For type aliases, include the full declaration if short
        if (content.length < 300) {
          return content;
        }
        // Return first line with ellipsis
        return firstLine + ' // ...';
      }

      case 'class': {
        // For classes, extract the class declaration line and method signatures
        const classDecl = firstLine;
        const methodSigs: string[] = [];

        for (let i = 1; i < lines.length && methodSigs.length < 5; i++) {
          const line = lines[i].trim();
          // Match method declarations
          const methodMatch = line.match(
            /^(?:public|private|protected|static|async|\s)*(\w+)\s*(?:<[^>]+>)?\s*\([^)]*\)/
          );
          if (methodMatch && !line.includes('{') || line.endsWith('{')) {
            methodSigs.push('  ' + line.replace(/\s*\{.*$/, ';'));
          }
        }

        if (methodSigs.length > 0) {
          return classDecl + '\n' + methodSigs.join('\n') + '\n}';
        }
        return classDecl + ' { /* ... */ }';
      }

      case 'function':
      case 'component': {
        // For functions/components, extract the signature (params and return type)
        // Look for the function signature up to the opening brace
        const signatureMatch = content.match(
          /^((?:export\s+)?(?:export\s+default\s+)?(?:async\s+)?(?:function\s+\w+|const\s+\w+\s*(?::\s*[^=]+)?\s*=\s*(?:async\s*)?\([^)]*\))[^{]*)/
        );
        if (signatureMatch) {
          return signatureMatch[1].trim() + ' { /* ... */ }';
        }
        return firstLine + ' { /* ... */ }';
      }

      case 'constant': {
        // For constants, include the full declaration if short
        if (content.length < 200) {
          return content;
        }
        // Return first line with ellipsis
        const constMatch = firstLine.match(/^((?:export\s+)?const\s+\w+\s*(?::\s*[^=]+)?\s*=)/);
        if (constMatch) {
          return constMatch[1] + ' /* ... */;';
        }
        return firstLine + ' // ...';
      }

      default:
        return firstLine;
    }
  }

  /**
   * Find dependencies (imported symbols used in the chunk).
   */
  private findDependencies(
    content: string,
    imports: Map<string, string[]>
  ): string[] {
    const dependencies: string[] = [];
    const allImportedSymbols = new Set<string>();

    // Collect all imported symbol names
    for (const specifiers of imports.values()) {
      for (const spec of specifiers) {
        allImportedSymbols.add(spec);
      }
    }

    // Check which imported symbols are used in the content
    for (const symbol of allImportedSymbols) {
      // Use word boundary to avoid partial matches
      const regex = new RegExp(`\\b${symbol}\\b`);
      if (regex.test(content)) {
        dependencies.push(symbol);
      }
    }

    return dependencies;
  }

  /**
   * Extract export info from chunks for file metadata.
   */
  private extractExportInfo(chunks: CodeChunk[]): ExportInfo[] {
    return chunks
      .filter((chunk) => chunk.isExported)
      .map((chunk) => ({
        name: chunk.symbolName,
        kind: chunk.chunkType,
      }));
  }
}

/**
 * Create a chunk index from project state.
 */
export function buildChunkIndex(projectState: ProjectState): ChunkIndex {
  const builder = new ChunkIndexBuilder();
  return builder.build(projectState);
}
