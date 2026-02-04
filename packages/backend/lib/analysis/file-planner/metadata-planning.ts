/**
 * Metadata-Based Planning Prompt Builder
 *
 * Builds planning prompts from compact file metadata (no content).
 * This enables the AI to select relevant files based on paths, types,
 * exports, and imports without requiring full file contents.
 *
 * Requirements: 2.3
 */

import type { FileTreeMetadata } from '@ai-app-builder/shared';

/**
 * Build a planning prompt from file metadata for AI consumption.
 *
 * Formats the file list with path, type, line count, exports, and imports
 * to help the AI understand the project structure and select relevant files.
 *
 * @param prompt - The user's modification request
 * @param metadata - Compact file tree metadata (no content)
 * @param projectName - Name of the project for context
 * @returns Formatted prompt string for the AI planning call
 */
export function buildMetadataBasedPrompt(
  prompt: string,
  metadata: FileTreeMetadata,
  projectName: string
): string {
  const fileList = metadata
    .map((f) => {
      const exports = f.exports.length > 0 ? ` [exports: ${f.exports.join(', ')}]` : '';
      const imports = f.imports.length > 0 ? ` [imports: ${f.imports.join(', ')}]` : '';
      return `- ${f.path} (${f.fileType}, ${f.lineCount} lines)${exports}${imports}`;
    })
    .join('\n');

  return `Project: ${projectName}

Files:
${fileList}

User Request: "${prompt}"

Select which files need to be modified (primary) and which are needed for context.
Return JSON: { "primaryFiles": [...], "contextFiles": [...], "reasoning": "..." }`;
}
