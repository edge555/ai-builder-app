/**
 * File Tree Metadata Generator
 *
 * Generates compact file tree metadata for the AI planning call.
 * Shows file paths, line counts, file types, and exported symbol names.
 * No code content is included in the output.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import { CHARS_PER_TOKEN } from '../../constants';

import type { ChunkIndex, FileMetadata, ExportInfo } from './types';

/** Target token budget for metadata */
const METADATA_TOKEN_BUDGET = 1000;

/**
 * Tree node for building hierarchical file structure.
 */
interface TreeNode {
  name: string;
  isFile: boolean;
  metadata?: FileMetadata;
  children: Map<string, TreeNode>;
}

/**
 * Generate compact file tree metadata from a ChunkIndex.
 * Format shows file path, line count, file type, and exported symbol names.
 * No code content is included.
 *
 * @param chunkIndex - The chunk index containing file metadata
 * @returns Compact tree string representation
 */
export function generateFileTreeMetadata(chunkIndex: ChunkIndex): string {
  const root = buildTree(chunkIndex.fileMetadata);
  const lines = renderTree(root, '');
  return lines.join('\n');
}

/**
 * Build a tree structure from flat file paths.
 */
function buildTree(fileMetadata: Map<string, FileMetadata>): TreeNode {
  const root: TreeNode = {
    name: '',
    isFile: false,
    children: new Map(),
  };

  for (const [filePath, metadata] of fileMetadata) {
    const parts = filePath.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          isFile: isLast,
          metadata: isLast ? metadata : undefined,
          children: new Map(),
        });
      }

      current = current.children.get(part)!;

      // Update metadata if this is the file node
      if (isLast) {
        current.isFile = true;
        current.metadata = metadata;
      }
    }
  }

  return root;
}


/**
 * Render tree to string lines with proper indentation.
 */
function renderTree(node: TreeNode, indent: string): string[] {
  const lines: string[] = [];

  // Sort children: directories first, then files, alphabetically within each group
  const sortedChildren = Array.from(node.children.values()).sort((a, b) => {
    if (a.isFile !== b.isFile) {
      return a.isFile ? 1 : -1; // Directories first
    }
    return a.name.localeCompare(b.name);
  });

  for (const child of sortedChildren) {
    if (child.isFile && child.metadata) {
      // Render file with metadata
      const fileInfo = formatFileInfo(child.metadata);
      lines.push(`${indent}${child.name} ${fileInfo}`);

      // Render exports if any
      const exportsLine = formatExports(child.metadata.exports);
      if (exportsLine) {
        lines.push(`${indent}  ${exportsLine}`);
      }
    } else {
      // Render directory
      lines.push(`${indent}${child.name}/`);
      // Recursively render children
      lines.push(...renderTree(child, indent + '  '));
    }
  }

  return lines;
}

/**
 * Format file info line: (N lines) [type]
 */
function formatFileInfo(metadata: FileMetadata): string {
  const lineCount = `(${metadata.lineCount} lines)`;
  const fileType = `[${metadata.fileType}]`;
  return `${lineCount} ${fileType}`;
}

/**
 * Format exports line: exports: Name1, Name2
 */
function formatExports(exports: ExportInfo[]): string {
  if (exports.length === 0) {
    return '';
  }

  // Format each export with its kind for clarity
  const exportNames = exports.map((e) => e.name);
  return `exports: ${exportNames.join(', ')}`;
}

/**
 * Estimate token count for a string.
 * Uses approximation of ~4 characters per token.
 */
export function estimateTokens(content: string): number {
  return Math.ceil(content.length / CHARS_PER_TOKEN);
}

/**
 * Check if metadata is within token budget.
 */
export function isWithinTokenBudget(
  metadata: string,
  budget: number = METADATA_TOKEN_BUDGET
): boolean {
  return estimateTokens(metadata) <= budget;
}
