/**
 * AI File Planner Types
 * 
 * Core type definitions for the AST-based code chunking and AI-powered file planning system.
 */

import type { CodeSlice as SharedCodeSlice, FileType as SharedFileType } from '@ai-app-builder/shared';

/**
 * Type of code chunk extracted from source files
 */
export type ChunkType = 'function' | 'component' | 'class' | 'interface' | 'type' | 'constant';

/**
 * Type of file based on its purpose
 */
export type FileType = SharedFileType;

/**
 * Relevance level for code slices
 */
export type RelevanceLevel = SharedCodeSlice['relevance'];

/**
 * Information about an exported symbol
 */
export interface ExportInfo {
  /** Name of the exported symbol */
  name: string;
  /** Type of the export */
  kind: ChunkType;
}

/**
 * A discrete unit of code extracted via AST parsing
 */
export interface CodeChunk {
  /** Unique identifier: filePath#symbolName */
  id: string;
  /** File path */
  filePath: string;
  /** Symbol name (function name, component name, etc.) */
  symbolName: string;
  /** Type of chunk */
  chunkType: ChunkType;
  /** Start line (1-indexed) */
  startLine: number;
  /** End line (1-indexed) */
  endLine: number;
  /** Full content of the chunk */
  content: string;
  /** Signature/outline only (for context use) */
  signature: string;
  /** Symbols this chunk references (imports used) */
  dependencies: string[];
  /** Exported or not */
  isExported: boolean;
}

/**
 * Metadata for files without parseable chunks
 */
export interface FileMetadata {
  /** File path */
  filePath: string;
  /** Type of file */
  fileType: FileType;
  /** Number of lines in the file */
  lineCount: number;
  /** Exported symbols */
  exports: ExportInfo[];
}

/**
 * Index of all code chunks in a project
 */
export interface ChunkIndex {
  /** All chunks indexed by id */
  chunks: Map<string, CodeChunk>;
  /** Chunks grouped by file path */
  chunksByFile: Map<string, CodeChunk[]>;
  /** File metadata (for files without parseable chunks) */
  fileMetadata: Map<string, FileMetadata>;
}

/**
 * Result from the AI planning call
 */
export interface FilePlannerResult {
  /** Files/chunks to include as primary (full content) */
  primaryFiles: string[];
  /** Files/chunks to include as context (outline only) */
  contextFiles: string[];
  /** Whether AI planning was used or fallback */
  usedFallback: boolean;
  /** AI's reasoning (if available) */
  reasoning?: string;
}

/**
 * Structured response from AI planning call
 */
export interface PlanningResponse {
  /** Files that need modification */
  primaryFiles: string[];
  /** Files needed for reference/types */
  contextFiles: string[];
  /** Brief explanation of selection */
  reasoning: string;
}

/**
 * Code slice compatible with existing SliceSelector interface
 */
export type CodeSlice = SharedCodeSlice;

/**
 * Scored file for fallback selection
 */
export interface ScoredFile {
  /** File path */
  filePath: string;
  /** Relevance score */
  score: number;
  /** Reasons for the match */
  matchReasons: string[];
}
