/**
 * File Planner Module
 *
 * AI-powered file planning system that optimizes context selection for modifications.
 * Uses a two-phase approach:
 * 1. Planning Phase: AI receives compact file tree metadata and selects relevant files
 * 2. Context Assembly: Selected files are assembled into CodeSlices for execution
 *
 * Requirements: 8.3
 */

// Main FilePlanner class and factory
export { FilePlanner, createFilePlanner } from './file-planner';

// Core types
export type {
  CodeChunk,
  ChunkIndex,
  FileMetadata,
  FilePlannerResult,
  PlanningResponse,
  CodeSlice,
  ScoredFile,
  ChunkType,
  FileType,
  RelevanceLevel,
  ExportInfo,
} from './types';

// Supporting classes (exported for testing/advanced use)
export { ChunkIndexBuilder } from './chunk-index';
export { FallbackSelector } from './fallback-selector';
export { TokenBudgetManager } from './token-budget';
export { generateFileTreeMetadata } from './metadata-generator';
export {
  buildPlanningPrompt,
  parsePlanningResponse,
  PLANNING_SYSTEM_PROMPT,
  PLANNING_TEMPERATURE,
} from './planning-prompt';

