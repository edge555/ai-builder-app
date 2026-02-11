/**
 * Metadata-Based Fallback Selector
 *
 * Heuristic-based file selection using only file metadata (no content).
 * Used when AI planning fails or is unavailable.
 *
 * Scoring strategies:
 * - Path matching: Match prompt keywords against file names
 * - Export name matching: Match prompt keywords against exported symbols
 * - FileType relevance: Prioritize files based on type and prompt intent
 * - Dependency expansion: Include files that import selected files as context
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */

import type { FileTreeMetadata } from '@ai-app-builder/shared';
import type { FilePlannerResult } from './types';

/** Style-related keywords that prioritize style files */
const STYLE_KEYWORDS = ['color', 'style', 'css', 'layout', 'theme', 'background', 'font', 'border', 'margin', 'padding'];

/** Component-related keywords that prioritize component files */
const COMPONENT_KEYWORDS = ['component', 'button', 'form', 'input', 'modal', 'dialog', 'card', 'list', 'table', 'menu'];

/** Hook-related keywords that prioritize hook files */
const HOOK_KEYWORDS = ['hook', 'use', 'state', 'effect', 'context', 'reducer'];

/** Config-related keywords that prioritize config files */
const CONFIG_KEYWORDS = ['config', 'configuration', 'settings', 'env', 'environment'];

/** API-related keywords that prioritize API route files */
const API_KEYWORDS = ['api', 'endpoint', 'route', 'fetch', 'request', 'response'];

/** Utility-related keywords that prioritize utility files */
const UTILITY_KEYWORDS = ['util', 'utility', 'helper', 'lib', 'common', 'shared'];

/** Minimum score threshold for primary file selection */
const PRIMARY_SCORE_THRESHOLD = 5;

/** Maximum number of primary files to select */
const MAX_PRIMARY_FILES = 5;

/** Maximum number of context files to select */
const MAX_CONTEXT_FILES = 5;

/**
 * MetadataFallbackSelector provides heuristic-based file selection
 * using only file metadata when AI planning fails or is unavailable.
 */
export class MetadataFallbackSelector {
  /**
   * Select files using heuristics based on file metadata.
   *
   * @param prompt - The user's modification request
   * @param metadata - Compact file tree metadata (no content)
   * @returns FilePlannerResult with selected primary and context files
   */
  select(prompt: string, metadata: FileTreeMetadata): FilePlannerResult {
    const scores = new Map<string, number>();
    const lowerPrompt = prompt.toLowerCase();

    // Score each file based on various matching strategies
    for (const file of metadata) {
      let score = 0;

      // Strategy 1: Match file path (file name without extension)
      score += this.scoreByPath(lowerPrompt, file.path);

      // Strategy 2: Match export names
      score += this.scoreByExports(lowerPrompt, file.exports);

      // Strategy 3: FileType relevance based on prompt intent
      score += this.scoreByFileType(lowerPrompt, file.fileType);

      scores.set(file.path, score);
    }

    // Sort by score and select top files
    const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    const primaryFiles = sorted
      .filter(([, s]) => s > PRIMARY_SCORE_THRESHOLD)
      .slice(0, MAX_PRIMARY_FILES)
      .map(([p]) => p);

    // Strategy 4: Dependency expansion - add files that import primary files as context
    const contextFiles = this.expandDependencies(metadata, primaryFiles);

    return {
      primaryFiles,
      contextFiles,
      usedFallback: true,
      reasoning: this.buildReasoning(primaryFiles, contextFiles, scores),
    };
  }

  /**
   * Score a file based on path matching.
   * Matches prompt keywords against the file name (without extension).
   */
  private scoreByPath(lowerPrompt: string, filePath: string): number {
    const fileName = filePath.split('/').pop() ?? '';
    const fileNameNoExt = fileName.replace(/\.\w+$/, '').toLowerCase();

    // Check if prompt contains the file name
    if (lowerPrompt.includes(fileNameNoExt)) {
      return 10;
    }

    // Check for partial matches with path segments
    const pathSegments = filePath.toLowerCase().split('/');
    for (const segment of pathSegments) {
      const segmentNoExt = segment.replace(/\.\w+$/, '');
      if (segmentNoExt.length > 2 && lowerPrompt.includes(segmentNoExt)) {
        return 5;
      }
    }

    return 0;
  }

  /**
   * Score a file based on export name matching.
   * Matches prompt keywords against exported symbol names.
   */
  private scoreByExports(lowerPrompt: string, exports: string[]): number {
    let score = 0;

    for (const exp of exports) {
      const lowerExp = exp.toLowerCase();
      if (lowerPrompt.includes(lowerExp)) {
        score += 8;
      }
    }

    return score;
  }

  /**
   * Score a file based on file type relevance.
   * Prioritizes files based on type when prompt contains related keywords.
   */
  private scoreByFileType(lowerPrompt: string, fileType: string): number {
    // Style-related keywords → prioritize style files
    if (STYLE_KEYWORDS.some((k) => lowerPrompt.includes(k))) {
      if (fileType === 'style') return 15;
    }

    // Component-related keywords → prioritize components
    if (COMPONENT_KEYWORDS.some((k) => lowerPrompt.includes(k))) {
      if (fileType === 'component') return 10;
    }

    // Hook-related keywords → prioritize hooks
    if (HOOK_KEYWORDS.some((k) => lowerPrompt.includes(k))) {
      if (fileType === 'hook') return 12;
    }

    // Config-related keywords → prioritize config files
    if (CONFIG_KEYWORDS.some((k) => lowerPrompt.includes(k))) {
      if (fileType === 'config') return 12;
    }

    // API-related keywords → prioritize API routes
    if (API_KEYWORDS.some((k) => lowerPrompt.includes(k))) {
      if (fileType === 'api_route') return 12;
    }

    // Utility-related keywords → prioritize utility files
    if (UTILITY_KEYWORDS.some((k) => lowerPrompt.includes(k))) {
      if (fileType === 'utility') return 10;
    }

    return 0;
  }

  /**
   * Expand dependencies by finding files that import the primary files.
   * These files become context files as they depend on the primary files.
   */
  private expandDependencies(
    metadata: FileTreeMetadata,
    primaryFiles: string[]
  ): string[] {
    if (primaryFiles.length === 0) {
      return [];
    }

    const contextFiles = metadata
      .filter((f) => !primaryFiles.includes(f.path))
      .filter((f) => {
        // Check if this file imports any of the primary files
        return f.imports.some((imp) => {
          // Normalize the import path for comparison
          // Imports might be relative like './Button' or '../components/Button'
          const normalizedImp = this.normalizeImportPath(imp);
          return primaryFiles.some((p) => {
            const normalizedPrimary = this.normalizeFilePath(p);
            return normalizedPrimary.includes(normalizedImp) || normalizedImp.includes(normalizedPrimary);
          });
        });
      })
      .map((f) => f.path)
      .slice(0, MAX_CONTEXT_FILES);

    return contextFiles;
  }

  /**
   * Normalize an import path for comparison.
   * Removes leading './' or '../' and file extensions.
   */
  private normalizeImportPath(importPath: string): string {
    return importPath
      .replace(/^\.\.?\//, '') // Remove leading ./ or ../
      .replace(/\.\w+$/, '') // Remove file extension
      .toLowerCase();
  }

  /**
   * Normalize a file path for comparison.
   * Removes file extension and converts to lowercase.
   */
  private normalizeFilePath(filePath: string): string {
    return filePath
      .replace(/\.\w+$/, '') // Remove file extension
      .toLowerCase();
  }

  /**
   * Build a reasoning string explaining the selection.
   */
  private buildReasoning(
    primaryFiles: string[],
    contextFiles: string[],
    scores: Map<string, number>
  ): string {
    if (primaryFiles.length === 0) {
      return 'No files matched the prompt criteria using heuristic selection.';
    }

    const primaryReasons = primaryFiles
      .map((f) => {
        const score = scores.get(f) ?? 0;
        const fileName = f.split('/').pop() ?? f;
        return `${fileName} (score: ${score})`;
      })
      .join(', ');

    let reasoning = `Selected primary files based on keyword matching: ${primaryReasons}`;

    if (contextFiles.length > 0) {
      const contextNames = contextFiles.map((f) => f.split('/').pop() ?? f).join(', ');
      reasoning += `. Added context files that import primary files: ${contextNames}`;
    }

    return reasoning;
  }
}

/**
 * Create a metadata fallback selector instance.
 */
export function createMetadataFallbackSelector(): MetadataFallbackSelector {
  return new MetadataFallbackSelector();
}
