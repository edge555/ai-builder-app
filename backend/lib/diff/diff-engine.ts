/**
 * Diff Engine Service
 * Computes line-level diffs between project versions.
 * Implements Requirements 5.1, 5.3
 * 
 * This module now delegates core logic to the @ai-app-builder/shared package.
 */

import type { FileDiff, ChangeSummary, ProjectState } from '@ai-app-builder/shared';
import {
  computeDiffs as sharedComputeDiffs,
  computeDiffsFromFiles as sharedComputeDiffsFromFiles,
  generateChangeSummary as sharedGenerateChangeSummary
} from '@ai-app-builder/shared';
import { logger } from '../logger';

/**
 * Computes diffs between two project states.
 * Requirements: 5.1, 5.3
 * 
 * @param oldState - The previous project state (or null for initial version)
 * @param newState - The new project state
 * @returns Array of file diffs
 */
export function computeDiffs(
  oldState: ProjectState | null,
  newState: ProjectState
): FileDiff[] {
  logger.debug('Computing diffs between project states', {
    oldStateExists: oldState !== null,
    oldFileCount: oldState ? Object.keys(oldState.files).length : 0,
    newFileCount: Object.keys(newState.files).length,
  });

  const sortedDiffs = sharedComputeDiffs(oldState, newState);

  logger.debug('Computed diffs', {
    totalDiffs: sortedDiffs.length,
    added: sortedDiffs.filter(d => d.status === 'added').length,
    modified: sortedDiffs.filter(d => d.status === 'modified').length,
    deleted: sortedDiffs.filter(d => d.status === 'deleted').length,
  });

  return sortedDiffs;
}

/**
 * Computes diffs between two file maps (for version comparison).
 * 
 * @param oldFiles - The old file map
 * @param newFiles - The new file map
 * @returns Array of file diffs
 */
export function computeDiffsFromFiles(
  oldFiles: Record<string, string>,
  newFiles: Record<string, string>
): FileDiff[] {
  return sharedComputeDiffsFromFiles(oldFiles, newFiles);
}

/**
 * Generates a human-readable change summary from diffs.
 * Requirements: 5.3
 * 
 * @param diffs - Array of file diffs
 * @returns Change summary object
 */
export function generateChangeSummary(diffs: FileDiff[]): ChangeSummary {
  return sharedGenerateChangeSummary(diffs);
}

/**
 * DiffEngine class for computing diffs between project states.
 */
export class DiffEngine {
  /**
   * Computes diffs between two project states.
   */
  computeDiffs(oldState: ProjectState | null, newState: ProjectState): FileDiff[] {
    return computeDiffs(oldState, newState);
  }

  /**
   * Computes diffs between two file maps.
   */
  computeDiffsFromFiles(
    oldFiles: Record<string, string>,
    newFiles: Record<string, string>
  ): FileDiff[] {
    return computeDiffsFromFiles(oldFiles, newFiles);
  }

  /**
   * Generates a change summary from diffs.
   */
  generateChangeSummary(diffs: FileDiff[]): ChangeSummary {
    return generateChangeSummary(diffs);
  }
}

// Singleton instance
let diffEngineInstance: DiffEngine | null = null;

/**
 * Gets the singleton DiffEngine instance.
 */
export function getDiffEngine(): DiffEngine {
  if (!diffEngineInstance) {
    diffEngineInstance = new DiffEngine();
  }
  return diffEngineInstance;
}

/**
 * Creates a new DiffEngine instance.
 * Use this for testing to get isolated instances.
 */
export function createDiffEngine(): DiffEngine {
  return new DiffEngine();
}
