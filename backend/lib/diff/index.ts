/**
 * Diff Module
 * 
 * Provides diff computation and modification orchestration services.
 * 
 * This module exports:
 * - DiffEngine: Computes line-level diffs between project versions
 * - ModificationEngine: Orchestrates context-aware code modifications
 * - Edit applicator: Applies search/replace edits to file content
 * - Diff computer: Computes diffs between file states
 * - Change summarizer: Creates human-readable change summaries
 * - Prompt builder: Builds modification prompts with code context
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

// Export all public symbols from extracted modules
export { applyEdits, normalizeContent } from './edit-applicator';
export {
  computeDiffs as computeFileDiffs,
  hasRealChanges,
  createAddedFileDiff,
  createDeletedFileDiff,
  createModifiedFileDiff,
} from './diff-computer';
export { createChangeSummary } from './change-summarizer';
export { buildModificationPrompt, buildSlicesFromFiles } from './prompt-builder';

