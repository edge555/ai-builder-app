/**
 * Analysis Module
 * 
 * Exports all code analysis services including file indexing,
 * dependency graph building, slice selection, intent classification,
 * and AI-powered file planning.
 */

// File Index
export { FileIndex, indexProject } from './file-index';

// Dependency Graph
export { DependencyGraph, buildDependencyGraph } from './dependency-graph';

// Slice Selector
export {
  SliceSelector,
  createSliceSelector,
  selectSlices,
  type SliceSelectorConfig,
} from './slice-selector';

// File Planner
export {
  FilePlanner,
  createFilePlanner,
  ChunkIndexBuilder,
  FallbackSelector,
  MetadataFallbackSelector,
  createMetadataFallbackSelector,
  MetadataFilePlanner,
  createMetadataFilePlanner,
  TokenBudgetManager,
  generateFileTreeMetadata,
  buildPlanningPrompt,
  parsePlanningResponse,
  buildMetadataBasedPrompt,
  PLANNING_SYSTEM_PROMPT,
  PLANNING_TEMPERATURE,
  type CodeChunk,
  type ChunkIndex,
  type FileMetadata,
  type FilePlannerResult,
  type PlanningResponse,
  type CodeSlice,
  type ScoredFile,
  type ChunkType,
  type FileType,
  type RelevanceLevel,
  type ExportInfo,
} from './file-planner';
