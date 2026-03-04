/**
 * @module analysis/slice-selector
 * @description Selects relevant code slices for modification requests.
 * Combines file-index search with dependency-graph traversal to select
 * primary files (full content) and context files (outline only) based
 * on intent classification. Context files use outline extraction to
 * reduce token usage while preserving structural information.
 *
 * @requires ./file-index - FileIndex for symbol/path search
 * @requires ./dependency-graph - DependencyGraph for transitive file resolution
 * @requires ../constants - MAX_PRIMARY_SLICES, MAX_CONTEXT_SLICES limits
 * @requires @ai-app-builder/shared - IntentClassification, ProjectState, CodeSlice types
 */

import type { IntentClassification, ProjectState, CodeSlice } from '@ai-app-builder/shared';
import { FileIndex } from './file-index';
import { DependencyGraph } from './dependency-graph';
import { MAX_PRIMARY_SLICES, MAX_CONTEXT_SLICES } from '../constants';

/**
 * Configuration for slice selection.
 */
export interface SliceSelectorConfig {
  /** Maximum number of primary slices to include */
  maxPrimarySlices?: number;
  /** Maximum number of context slices to include */
  maxContextSlices?: number;
  /** Whether to include dependents of primary files */
  includeDependents?: boolean;
  /** Whether to include dependencies of primary files */
  includeDependencies?: boolean;
}

const DEFAULT_CONFIG: Required<SliceSelectorConfig> = {
  maxPrimarySlices: MAX_PRIMARY_SLICES,
  maxContextSlices: MAX_CONTEXT_SLICES,
  includeDependents: true,
  includeDependencies: true,
};

/**
 * Extracts a file outline containing only signatures and key structural elements.
 * This reduces token usage for context files while preserving important information.
 */
function getFileOutline(content: string, filePath: string): string {
  const lines = content.split('\n');
  const outlineLines: string[] = [];

  // Track context
  let inFunction = false;
  let inClass = false;
  let braceDepth = 0;
  let lastExportLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Always include imports
    if (trimmed.startsWith('import ') || trimmed.startsWith('import{')) {
      outlineLines.push(line);
      continue;
    }

    // Always include exports (type exports, re-exports)
    if (trimmed.startsWith('export type') || trimmed.startsWith('export interface') ||
      trimmed.startsWith('export {') || trimmed.startsWith('export *')) {
      outlineLines.push(line);
      continue;
    }

    // Include function/component declarations (first line only)
    if (trimmed.match(/^(export\s+)?(async\s+)?function\s+\w+/) ||
      trimmed.match(/^(export\s+)?const\s+\w+\s*[:=]\s*(\(|React\.FC|async)/) ||
      trimmed.match(/^(export\s+)?class\s+\w+/)) {
      outlineLines.push(line);

      // Add a placeholder for the body
      if (!trimmed.includes('=>') || trimmed.endsWith('{')) {
        outlineLines.push('  // ... implementation ...');
      }
      continue;
    }

    // Include interface/type definitions (full)
    if (trimmed.startsWith('interface ') || trimmed.startsWith('type ') ||
      trimmed.startsWith('export interface') || trimmed.startsWith('export type')) {
      outlineLines.push(line);
      // Include the full interface/type body
      let depth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      while (depth > 0 && i < lines.length - 1) {
        i++;
        outlineLines.push(lines[i]);
        depth += (lines[i].match(/{/g) || []).length - (lines[i].match(/}/g) || []).length;
      }
      continue;
    }

    // Include export default
    if (trimmed.startsWith('export default')) {
      outlineLines.push(line);
      continue;
    }
  }

  // Add a header comment
  const header = `// FILE OUTLINE: ${filePath}\n// (Showing signatures only, full content in primary files)\n`;

  return header + outlineLines.join('\n');
}


/**
 * Slice Selector service for selecting relevant code slices.
 */
export class SliceSelector {
  private config: Required<SliceSelectorConfig>;

  constructor(config?: SliceSelectorConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Select relevant code slices for a modification request.
   */
  selectSlices(
    intent: IntentClassification,
    projectState: ProjectState,
    fileIndex: FileIndex,
    dependencyGraph: DependencyGraph
  ): CodeSlice[] {
    const slices: CodeSlice[] = [];
    const primaryPaths = new Set<string>();
    const contextPaths = new Set<string>();

    // Dynamic config adjustment for simple/focused intents to save tokens
    // If the intent is high confidence and focused on a few files, we don't need as broad a context
    let effectiveConfig = { ...this.config };
    if (intent.confidence > 0.9 && intent.affectedAreas.length > 0 && intent.affectedAreas.length <= 2) {
      effectiveConfig.maxPrimarySlices = Math.min(effectiveConfig.maxPrimarySlices, 3);
      effectiveConfig.maxContextSlices = Math.min(effectiveConfig.maxContextSlices, 5);
    }

    // Step 1: Find primary files based on intent
    const primaryFiles = this.findPrimaryFiles(intent, projectState, fileIndex);
    for (const filePath of primaryFiles) {
      if (primaryPaths.size < effectiveConfig.maxPrimarySlices) {
        primaryPaths.add(filePath);
      }
    }

    // Step 2: Add dependents if configured (files that import primary files)
    if (this.config.includeDependents) {
      for (const primaryPath of primaryPaths) {
        const dependents = dependencyGraph.getDependents(primaryPath);
        for (const dependent of dependents) {
          if (!primaryPaths.has(dependent) && contextPaths.size < this.config.maxContextSlices) {
            contextPaths.add(dependent);
          }
        }
      }
    }

    // Step 3: Add dependencies if configured (files that primary files import)
    if (this.config.includeDependencies) {
      for (const primaryPath of primaryPaths) {
        const dependencies = dependencyGraph.getDependencies(primaryPath);
        for (const dependency of dependencies) {
          if (!primaryPaths.has(dependency) && contextPaths.size < this.config.maxContextSlices) {
            contextPaths.add(dependency);
          }
        }
      }
    }

    // Step 4: Build slices with content
    for (const filePath of primaryPaths) {
      const content = projectState.files[filePath];
      if (content !== undefined) {
        slices.push({
          filePath,
          content,
          relevance: 'primary',
        });
      }
    }

    for (const filePath of contextPaths) {
      const content = projectState.files[filePath];
      if (content !== undefined) {
        // Use file outline for context files to reduce token usage
        const outline = getFileOutline(content, filePath);
        slices.push({
          filePath,
          content: outline,
          relevance: 'context',
        });
      }
    }


    return slices;
  }

  /**
   * Find primary files based on intent classification.
   */
  private findPrimaryFiles(
    intent: IntentClassification,
    projectState: ProjectState,
    fileIndex: FileIndex
  ): string[] {
    const primaryFiles: string[] = [];
    const allFiles = Object.keys(projectState.files);

    // First, check if affected areas directly match file paths
    for (const area of intent.affectedAreas) {
      // Direct file path match
      if (projectState.files[area] !== undefined) {
        primaryFiles.push(area);
        continue;
      }

      // Search for files matching the area name
      const searchResults = fileIndex.search(area);
      for (const entry of searchResults) {
        if (!primaryFiles.includes(entry.filePath)) {
          primaryFiles.push(entry.filePath);
        }
      }
    }

    // If no files found from affected areas, use intent type to find relevant files
    if (primaryFiles.length === 0) {
      const typeBasedFiles = this.findFilesByIntentType(intent.type, allFiles, fileIndex);
      primaryFiles.push(...typeBasedFiles);
    }

    return primaryFiles;
  }

  /**
   * Find files based on intent type when no specific areas are identified.
   */
  private findFilesByIntentType(
    intentType: IntentClassification['type'],
    allFiles: string[],
    fileIndex: FileIndex
  ): string[] {
    const files: string[] = [];

    switch (intentType) {
      case 'add_component':
      case 'modify_component':
        // Find component files
        for (const filePath of allFiles) {
          const entry = fileIndex.getEntry(filePath);
          if (entry?.fileType === 'component' || entry?.components.length) {
            files.push(filePath);
          }
        }
        // Also include App.tsx as it often needs updating for new components
        for (const filePath of allFiles) {
          if (filePath.endsWith('App.tsx') || filePath.endsWith('App.jsx')) {
            if (!files.includes(filePath)) {
              files.push(filePath);
            }
          }
        }
        break;

      case 'add_route':
        // Find API route files
        for (const filePath of allFiles) {
          const entry = fileIndex.getEntry(filePath);
          if (entry?.fileType === 'api_route') {
            files.push(filePath);
          }
        }
        // Include app directory structure for Next.js
        for (const filePath of allFiles) {
          if (filePath.includes('/app/') && filePath.includes('route.')) {
            if (!files.includes(filePath)) {
              files.push(filePath);
            }
          }
        }
        break;

      case 'modify_style':
        // Find style files
        for (const filePath of allFiles) {
          const entry = fileIndex.getEntry(filePath);
          if (entry?.fileType === 'style') {
            files.push(filePath);
          }
        }
        // Also include CSS files by extension
        for (const filePath of allFiles) {
          if (
            filePath.endsWith('.css') ||
            filePath.endsWith('.scss') ||
            filePath.endsWith('.less')
          ) {
            if (!files.includes(filePath)) {
              files.push(filePath);
            }
          }
        }
        break;

      case 'refactor':
        // For refactoring, include utility and hook files
        for (const filePath of allFiles) {
          const entry = fileIndex.getEntry(filePath);
          if (entry?.fileType === 'utility' || entry?.fileType === 'hook') {
            files.push(filePath);
          }
        }
        break;

      case 'delete':
        // For delete, we need to identify what to delete from context
        // This is typically handled by affected areas
        break;

      case 'generate':
      case 'other':
      default:
        // For general modifications, include main entry points
        for (const filePath of allFiles) {
          if (
            filePath.endsWith('App.tsx') ||
            filePath.endsWith('App.jsx') ||
            filePath.endsWith('main.tsx') ||
            filePath.endsWith('main.jsx') ||
            filePath.endsWith('index.tsx') ||
            filePath.endsWith('index.jsx')
          ) {
            files.push(filePath);
          }
        }
        break;
    }

    return files;
  }
}

/**
 * Create a SliceSelector instance.
 */
export function createSliceSelector(config?: SliceSelectorConfig): SliceSelector {
  return new SliceSelector(config);
}

/**
 * Convenience function to select slices for a modification request.
 */
export function selectSlices(
  intent: IntentClassification,
  projectState: ProjectState,
  fileIndex: FileIndex,
  dependencyGraph: DependencyGraph,
  config?: SliceSelectorConfig
): CodeSlice[] {
  const selector = new SliceSelector(config);
  return selector.selectSlices(intent, projectState, fileIndex, dependencyGraph);
}
