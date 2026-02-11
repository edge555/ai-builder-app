/**
 * Diff Module
 * 
 * Provides diff computation and modification orchestration services.
 * 
 * This module exports:
 * - DiffEngine: Computes line-level diffs between project versions
 * - ModificationEngine: Orchestrates context-aware code modifications
 */

// Export all public symbols from diff-engine
export {
  computeDiffs,
  computeDiffsFromFiles,
  generateChangeSummary,
  DiffEngine,
  getDiffEngine,
  createDiffEngine,
} from './diff-engine';

// Export all public symbols from modification-engine
export type { ModificationResult } from './modification-engine';
export {
  ModificationEngine,
  createModificationEngine,
} from './modification-engine';
