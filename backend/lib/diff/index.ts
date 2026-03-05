/**
 * Diff Module
 *
 * Provides diff computation and modification orchestration services.
 */

export {
  DiffEngine,
  getDiffEngine,
  createDiffEngine,
} from './diff-engine';

export {
  ModificationEngine,
  createModificationEngine,
  type ModificationPhase,
  type OnProgressCallback,
} from './modification-engine';

