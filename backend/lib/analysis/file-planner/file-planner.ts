/**
 * File Planner
 *
 * Main orchestrator for AI-powered file planning.
 * Uses a two-phase approach:
 * 1. Planning Phase: AI receives compact file tree metadata and selects relevant files
 * 2. Context Assembly: Selected files are assembled into CodeSlices for execution
 */

import type { ProjectState } from '@ai-app-builder/shared';
import type { AIProvider } from '../../ai/ai-provider';
import { getMaxOutputTokens } from '../../config';
import { createLogger } from '../../logger';
import type { ChunkIndex, CodeSlice, FilePlannerResult, PlanningResponse } from './types';
import { ChunkIndexBuilder } from './chunk-index';
import { generateFileTreeMetadata } from './metadata-generator';
import { FallbackSelector } from './fallback-selector';
import { TokenBudgetManager } from './token-budget';
import {
  getPlanningSystemPrompt,
  PLANNING_TEMPERATURE,
  PLANNING_OUTPUT_SCHEMA,
  buildPlanningPrompt,
  parsePlanningResponse,
} from './planning-prompt';

const logger = createLogger('file-planner');

/**
 * FilePlanner orchestrates AI-powered file selection for modifications.
 * Replaces IntentClassifier in ModificationEngine.
 */
export class FilePlanner {
  private aiProvider: AIProvider | null;
  private fallbackSelector: FallbackSelector;
  private tokenBudgetManager: TokenBudgetManager;
  private chunkIndexBuilder: ChunkIndexBuilder;

  // Cache for chunk index to avoid rebuilding on retries
  private chunkIndexCache: Map<string, { index: ChunkIndex; timestamp: number; estimatedSize: number }>;
  private readonly CACHE_TTL_MS = 60000; // 1 minute TTL
  private readonly MAX_CACHE_ENTRIES = 3; // Reduced from 5 to 3
  private readonly MAX_CACHE_MEMORY_BYTES = 50 * 1024 * 1024; // 50MB limit
  private currentCacheMemoryUsage = 0;

  // Optimized symbol lookup map (uses same key as chunkIndexCache)
  private symbolLookupCache: Map<string, Map<string, { filePath: string; signature: string; symbolName: string }>>;

  // Current cache key for the active chunk index (ensures consistency)
  private currentCacheKey: string | null = null;

  constructor(aiProvider?: AIProvider) {
    this.aiProvider = aiProvider ?? null;
    this.fallbackSelector = new FallbackSelector();
    this.tokenBudgetManager = new TokenBudgetManager();
    this.chunkIndexBuilder = new ChunkIndexBuilder();
    this.chunkIndexCache = new Map();
    this.symbolLookupCache = new Map();
  }

  /**
   * Plan which files/chunks to include for a modification.
   * Returns CodeSlices compatible with SliceSelector output.
   */
  async plan(prompt: string, projectState: ProjectState): Promise<CodeSlice[]> {
    const result = await this.planWithCategory(prompt, projectState);
    return result.slices;
  }

  /**
   * Plan which files/chunks to include for a modification, including category.
   * Returns CodeSlices and the modification category.
   */
  async planWithCategory(prompt: string, projectState: ProjectState): Promise<{ slices: CodeSlice[]; category: 'ui' | 'logic' | 'style' | 'mixed' }> {
    logger.info('Starting file planning', { prompt: prompt.substring(0, 100) });

    // Step 1: Build or retrieve cached chunk index
    const { index: chunkIndex, fromCache } = this.getCachedChunkIndex(projectState);
    logger.debug('Chunk index ready', {
      chunkCount: chunkIndex.chunks.size,
      fileCount: chunkIndex.fileMetadata.size,
      fromCache,
    });

    // Step 2: Generate file tree metadata for planning call
    const metadata = generateFileTreeMetadata(chunkIndex);
    logger.debug('Generated metadata', { metadataLength: metadata.length });

    // Step 3: Call AI for planning (or fall back to heuristics)
    let plannerResult: FilePlannerResult;

    if (this.aiProvider) {
      plannerResult = await this.callPlanningAI(prompt, metadata, chunkIndex, projectState);
    } else {
      logger.info('No AI provider available, using fallback selector');
      plannerResult = this.fallbackSelector.select(prompt, chunkIndex, projectState);
    }

    logger.info('Planning result', {
      primaryFiles: plannerResult.primaryFiles.length,
      contextFiles: plannerResult.contextFiles.length,
      category: plannerResult.category,
      usedFallback: plannerResult.usedFallback,
    });

    // Step 4: Assemble CodeSlices from selected files
    let slices = this.assembleSlices(plannerResult, chunkIndex, projectState);

    // Step 5: Apply token budget trimming
    slices = this.tokenBudgetManager.trimToFit(slices, chunkIndex);

    logger.info('File planning complete', { sliceCount: slices.length, category: plannerResult.category });

    return {
      slices,
      category: plannerResult.category ?? 'mixed',
    };
  }


  /**
   * Call AI to select relevant files.
   * Falls back to heuristic selection on any failure.
   */
  private async callPlanningAI(
    prompt: string,
    metadata: string,
    chunkIndex: ChunkIndex,
    projectState: ProjectState
  ): Promise<FilePlannerResult> {
    try {
      const planningPrompt = buildPlanningPrompt(prompt, metadata);

      logger.debug('Calling Gemini for planning', {
        promptLength: planningPrompt.length,
      });

      const response = await this.aiProvider!.generate({
        prompt: planningPrompt,
        systemInstruction: getPlanningSystemPrompt(),
        temperature: PLANNING_TEMPERATURE,
        maxOutputTokens: getMaxOutputTokens('planning'),
        responseSchema: PLANNING_OUTPUT_SCHEMA,
      });

      if (!response.success || !response.content) {
        logger.warn('AI planning call failed', { error: response.error });
        return this.fallbackSelector.select(prompt, chunkIndex, projectState);
      }

      const parsed = this.parseAIResponse(response.content);

      if (!parsed) {
        logger.warn('Failed to parse AI response, using fallback');
        return this.fallbackSelector.select(prompt, chunkIndex, projectState);
      }

      // Validate that selected files exist in project
      const validatedResult = this.validateFileSelection(parsed, projectState);

      if (validatedResult.primaryFiles.length === 0) {
        logger.warn('No valid primary files selected, using fallback');
        return this.fallbackSelector.select(prompt, chunkIndex, projectState);
      }

      return {
        ...validatedResult,
        category: parsed.category,
        usedFallback: false,
      };
    } catch (error) {
      logger.error('AI planning call exception', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.fallbackSelector.select(prompt, chunkIndex, projectState);
    }
  }

  /**
   * Parse AI response to extract file lists.
   */
  private parseAIResponse(response: string): PlanningResponse | null {
    const parsed = parsePlanningResponse(response);

    if (!parsed) {
      logger.debug('Could not parse planning response', {
        response: response.substring(0, 200),
      });
      return null;
    }

    return parsed;
  }

  /**
   * Validate that selected files exist in the project.
   */
  private validateFileSelection(
    result: PlanningResponse,
    projectState: ProjectState
  ): FilePlannerResult {
    const projectFiles = new Set(Object.keys(projectState.files));

    const primaryFiles = result.primaryFiles.filter((f) => projectFiles.has(f));
    const contextFiles = result.contextFiles.filter((f) => projectFiles.has(f));

    // Log any invalid files
    const invalidPrimary = result.primaryFiles.filter((f) => !projectFiles.has(f));
    const invalidContext = result.contextFiles.filter((f) => !projectFiles.has(f));

    if (invalidPrimary.length > 0 || invalidContext.length > 0) {
      logger.warn('Some selected files do not exist in project', {
        invalidPrimary,
        invalidContext,
      });
    }

    return {
      primaryFiles,
      contextFiles,
      usedFallback: false,
      reasoning: result.reasoning,
    };
  }


  /**
   * Assemble CodeSlices from selected files.
   * Primary files get full content, context files get signatures/outlines.
   * Also expands dependencies for primary chunks.
   */
  private assembleSlices(
    result: FilePlannerResult,
    chunkIndex: ChunkIndex,
    projectState: ProjectState
  ): CodeSlice[] {
    const slices: CodeSlice[] = [];
    const includedFiles = new Set<string>();

    // Add primary files with full content
    for (const filePath of result.primaryFiles) {
      const content = projectState.files[filePath];
      if (content) {
        slices.push({
          filePath,
          content,
          relevance: 'primary',
        });
        includedFiles.add(filePath);
      }
    }

    // Add context files with signatures/outlines only
    for (const filePath of result.contextFiles) {
      if (includedFiles.has(filePath)) {
        continue; // Already included as primary
      }

      const outline = this.getFileOutline(filePath, chunkIndex, projectState);
      if (outline) {
        slices.push({
          filePath,
          content: outline,
          relevance: 'context',
        });
        includedFiles.add(filePath);
      }
    }

    // Expand dependencies for primary chunks (1 level only)
    const dependencySlices = this.expandDependencies(
      result.primaryFiles,
      chunkIndex,
      includedFiles
    );
    slices.push(...dependencySlices);

    return slices;
  }

  /**
   * Get file outline (signatures only) for context files.
   */
  private getFileOutline(
    filePath: string,
    chunkIndex: ChunkIndex,
    projectState: ProjectState
  ): string | null {
    const fileChunks = chunkIndex.chunksByFile.get(filePath);

    if (fileChunks && fileChunks.length > 0) {
      // Build outline from chunk signatures
      const signatures = fileChunks.map((chunk) => chunk.signature);
      const header = `// FILE OUTLINE: ${filePath}\n// (Showing signatures only)\n\n`;
      return header + signatures.join('\n\n');
    }

    // For non-code files or files without chunks, return the full content if small
    const content = projectState.files[filePath];
    if (content) {
      // For small files (< 50 lines), include full content
      const lineCount = content.split('\n').length;
      if (lineCount < 50) {
        return content;
      }

      // For larger files, create a simple outline
      return this.createSimpleOutline(content, filePath);
    }

    return null;
  }

  /**
   * Create a simple outline for files without chunk data.
   */
  private createSimpleOutline(content: string, filePath: string): string {
    const lines = content.split('\n');
    const outlineLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Include imports
      if (trimmed.startsWith('import ')) {
        outlineLines.push(line);
        continue;
      }

      // Include exports and declarations
      if (
        trimmed.startsWith('export ') ||
        trimmed.match(/^(async\s+)?function\s+\w+/) ||
        trimmed.match(/^class\s+\w+/) ||
        trimmed.match(/^interface\s+\w+/) ||
        trimmed.match(/^type\s+\w+/)
      ) {
        outlineLines.push(line);
        outlineLines.push('  // ... implementation ...');
      }
    }

    const header = `// FILE OUTLINE: ${filePath}\n// (Showing signatures only)\n\n`;
    return header + outlineLines.join('\n');
  }


  /**
   * Expand dependencies for primary chunks.
   * Adds referenced symbols as context (outline only).
   * Limited to 1 level (direct dependencies only).
   */
  private expandDependencies(
    primaryFiles: string[],
    chunkIndex: ChunkIndex,
    includedFiles: Set<string>
  ): CodeSlice[] {
    const dependencySlices: CodeSlice[] = [];
    const processedSymbols = new Set<string>();

    // Collect all dependencies from primary file chunks
    for (const filePath of primaryFiles) {
      const fileChunks = chunkIndex.chunksByFile.get(filePath);
      if (!fileChunks) continue;

      for (const chunk of fileChunks) {
        for (const dep of chunk.dependencies) {
          if (processedSymbols.has(dep)) continue;
          processedSymbols.add(dep);

          // Find the chunk that defines this symbol
          const depChunk = this.findChunkBySymbol(dep, chunkIndex);
          if (!depChunk) continue;

          // Skip if file already included
          if (includedFiles.has(depChunk.filePath)) continue;

          // Add as context with signature only
          dependencySlices.push({
            filePath: depChunk.filePath,
            content: this.formatDependencyContext(depChunk),
            relevance: 'context',
          });
          includedFiles.add(depChunk.filePath);

          logger.debug('Added dependency as context', {
            symbol: dep,
            filePath: depChunk.filePath,
          });
        }
      }
    }

    return dependencySlices;
  }

  /**
   * Find a chunk by symbol name using optimized lookup.
   * Uses a Map for O(1) lookup instead of O(n) iteration.
   * Uses currentCacheKey to ensure consistency with chunkIndexCache.
   */
  private findChunkBySymbol(
    symbolName: string,
    chunkIndex: ChunkIndex
  ): { filePath: string; signature: string; symbolName: string } | null {
    // Use currentCacheKey to ensure consistency with chunkIndexCache
    // This prevents orphaned entries in symbolLookupCache
    const cacheKey = this.currentCacheKey;

    if (!cacheKey) {
      // Fallback if currentCacheKey is not set (shouldn't happen in normal flow)
      logger.warn('currentCacheKey not set, building symbol map without caching');
      const symbolMap = new Map<string, { filePath: string; signature: string; symbolName: string }>();
      chunkIndex.chunks.forEach((chunk) => {
        if (chunk.isExported) {
          symbolMap.set(chunk.symbolName, {
            filePath: chunk.filePath,
            signature: chunk.signature,
            symbolName: chunk.symbolName,
          });
        }
      });
      return symbolMap.get(symbolName) ?? null;
    }

    let symbolMap = this.symbolLookupCache.get(cacheKey);

    if (!symbolMap) {
      // Build the symbol lookup map
      symbolMap = new Map();
      chunkIndex.chunks.forEach((chunk) => {
        if (chunk.isExported) {
          symbolMap!.set(chunk.symbolName, {
            filePath: chunk.filePath,
            signature: chunk.signature,
            symbolName: chunk.symbolName,
          });
        }
      });
      this.symbolLookupCache.set(cacheKey, symbolMap);
      logger.debug('Built symbol lookup map', { cacheKey, symbolCount: symbolMap.size });
    }

    return symbolMap!.get(symbolName) ?? null;
  }

  /**
   * Estimate the memory size of a ChunkIndex in bytes.
   * This is a rough approximation based on the data structures.
   */
  private estimateChunkIndexSize(index: ChunkIndex): number {
    let totalSize = 0;

    // Estimate chunks Map size
    index.chunks.forEach((chunk) => {
      totalSize += chunk.content.length * 2; // UTF-16 characters
      totalSize += chunk.filePath.length * 2;
      totalSize += chunk.id.length * 2;
      totalSize += chunk.signature.length * 2;
      totalSize += chunk.symbolName.length * 2;
      totalSize += chunk.dependencies.reduce((sum: number, dep: string) => sum + dep.length * 2, 0);
      totalSize += 200; // Overhead for object structure and other fields
    });

    // Estimate fileMetadata Map size
    index.fileMetadata.forEach((metadata) => {
      totalSize += metadata.filePath.length * 2;
      totalSize += metadata.exports.reduce((sum: number, exp) => sum + exp.name.length * 2, 0);
      totalSize += 100; // Overhead for object structure
    });

    return totalSize;
  }

  /**
   * Clear both caches. Useful for testing and manual cleanup.
   */
  clear(): void {
    this.chunkIndexCache.clear();
    this.symbolLookupCache.clear();
    this.currentCacheMemoryUsage = 0;
    logger.info('Cache cleared');
  }

  /**
   * Get or build cached chunk index for a project state.
   * Caches based on file count and total content length to detect changes.
   * Implements memory-based eviction to prevent unbounded growth.
   */
  private getCachedChunkIndex(projectState: ProjectState): { index: ChunkIndex; fromCache: boolean } {
    const cacheKey = this.getProjectStateCacheKey(projectState);

    // Set current cache key for consistent usage across methods
    this.currentCacheKey = cacheKey;

    const cached = this.chunkIndexCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < this.CACHE_TTL_MS) {
      logger.debug('Using cached chunk index', {
        cacheKey,
        estimatedSize: `${(cached.estimatedSize / 1024 / 1024).toFixed(2)}MB`,
      });
      return { index: cached.index, fromCache: true };
    }

    // Build new index
    logger.debug('Building new chunk index', { cacheKey });
    const index = this.chunkIndexBuilder.build(projectState);

    // Estimate size
    const estimatedSize = this.estimateChunkIndexSize(index);

    // Cache it
    this.chunkIndexCache.set(cacheKey, { index, timestamp: now, estimatedSize });
    this.currentCacheMemoryUsage += estimatedSize;

    logger.debug('Cached chunk index', {
      cacheKey,
      estimatedSize: `${(estimatedSize / 1024 / 1024).toFixed(2)}MB`,
      totalCacheMemory: `${(this.currentCacheMemoryUsage / 1024 / 1024).toFixed(2)}MB`,
    });

    // Evict based on both count and memory limits
    this.evictCacheIfNeeded();

    return { index, fromCache: false };
  }

  /**
   * Evict cache entries if count or memory limits exceeded.
   * Uses LRU (Least Recently Used) eviction strategy.
   */
  private evictCacheIfNeeded(): void {
    const needsEviction =
      this.chunkIndexCache.size > this.MAX_CACHE_ENTRIES ||
      this.currentCacheMemoryUsage > this.MAX_CACHE_MEMORY_BYTES;

    if (!needsEviction) {
      return;
    }

    const { finalEntries, keysToKeep } = this.selectEntriesToKeep();
    const evictedCount = this.chunkIndexCache.size - finalEntries.length;

    this.rebuildCache(finalEntries);
    this.cleanupSymbolLookupCache(keysToKeep);

    if (evictedCount > 0) {
      logger.info('Evicted cache entries', {
        evictedCount,
        remainingEntries: this.chunkIndexCache.size,
        totalMemory: `${(this.currentCacheMemoryUsage / 1024 / 1024).toFixed(2)}MB`,
        maxMemory: `${(this.MAX_CACHE_MEMORY_BYTES / 1024 / 1024).toFixed(2)}MB`,
      });
    }
  }

  /**
   * Select cache entries to keep based on recency and memory budget.
   */
  private selectEntriesToKeep(): {
    finalEntries: Array<[string, { index: ChunkIndex; timestamp: number; estimatedSize: number }]>;
    keysToKeep: Set<string>;
  } {
    const entries: Array<[string, { index: ChunkIndex; timestamp: number; estimatedSize: number }]> = [];
    this.chunkIndexCache.forEach((value, key) => {
      entries.push([key, value]);
    });
    entries.sort((a, b) => b[1].timestamp - a[1].timestamp);

    const toKeep = entries.slice(0, this.MAX_CACHE_ENTRIES);
    let newMemoryUsage = 0;
    const keysToKeep = new Set<string>();
    const finalEntries: Array<[string, { index: ChunkIndex; timestamp: number; estimatedSize: number }]> = [];

    for (const [key, value] of toKeep) {
      if (newMemoryUsage + value.estimatedSize > this.MAX_CACHE_MEMORY_BYTES) break;
      finalEntries.push([key, value]);
      keysToKeep.add(key);
      newMemoryUsage += value.estimatedSize;
    }

    return { finalEntries, keysToKeep };
  }

  /**
   * Rebuild the chunk index cache from selected entries.
   */
  private rebuildCache(
    entries: Array<[string, { index: ChunkIndex; timestamp: number; estimatedSize: number }]>
  ): void {
    this.chunkIndexCache.clear();
    this.currentCacheMemoryUsage = 0;

    for (const [key, value] of entries) {
      this.chunkIndexCache.set(key, value);
      this.currentCacheMemoryUsage += value.estimatedSize;
    }
  }

  /**
   * Remove symbol lookup entries that are no longer in the chunk index cache.
   */
  private cleanupSymbolLookupCache(keysToKeep: Set<string>): void {
    const keysToRemove: string[] = [];
    this.symbolLookupCache.forEach((_, key) => {
      if (!keysToKeep.has(key)) {
        keysToRemove.push(key);
      }
    });
    keysToRemove.forEach(key => this.symbolLookupCache.delete(key));
  }


  /**
   * Generate a cache key for project state based on file count and content hash.
   */
  private getProjectStateCacheKey(projectState: ProjectState): string {
    const fileCount = Object.keys(projectState.files).length;
    const totalLength = Object.values(projectState.files).reduce((sum, content) => sum + content.length, 0);
    return `${projectState.id}_${fileCount}_${totalLength}`;
  }

  /**
   * Format a dependency chunk for context inclusion.
   */
  private formatDependencyContext(depChunk: {
    filePath: string;
    signature: string;
    symbolName: string;
  }): string {
    const header = `// DEPENDENCY: ${depChunk.symbolName} from ${depChunk.filePath}\n`;
    return header + depChunk.signature;
  }
}

/**
 * Create a FilePlanner instance.
 * If no AIProvider is provided, attempts to create one from environment.
 * Falls back to heuristic-only mode if the provider is unavailable.
 */
export function createFilePlanner(aiProvider?: AIProvider): FilePlanner {
  if (aiProvider) {
    return new FilePlanner(aiProvider);
  }

  // No provider given — fallback-only mode
  logger.warn('No AI provider given to createFilePlanner, using fallback-only mode');
  return new FilePlanner();
}
