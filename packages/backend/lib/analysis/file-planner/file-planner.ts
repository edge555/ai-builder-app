/**
 * File Planner
 *
 * Main orchestrator for AI-powered file planning.
 * Uses a two-phase approach:
 * 1. Planning Phase: AI receives compact file tree metadata and selects relevant files
 * 2. Context Assembly: Selected files are assembled into CodeSlices for execution
 *
 * Requirements: 3.1, 3.2, 3.4, 3.5, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 8.4
 */

import type { ProjectState } from '@ai-app-builder/shared';
import type { GeminiClient } from '../../ai/gemini-client';
import { createGeminiClient } from '../../ai/gemini-client';
import { createLogger } from '../../logger';
import type { ChunkIndex, CodeSlice, FilePlannerResult, PlanningResponse } from './types';
import { ChunkIndexBuilder } from './chunk-index';
import { generateFileTreeMetadata } from './metadata-generator';
import { FallbackSelector } from './fallback-selector';
import { TokenBudgetManager } from './token-budget';
import {
  PLANNING_SYSTEM_PROMPT,
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
  private geminiClient: GeminiClient | null;
  private fallbackSelector: FallbackSelector;
  private tokenBudgetManager: TokenBudgetManager;
  private chunkIndexBuilder: ChunkIndexBuilder;

  constructor(geminiClient?: GeminiClient) {
    this.geminiClient = geminiClient ?? null;
    this.fallbackSelector = new FallbackSelector();
    this.tokenBudgetManager = new TokenBudgetManager();
    this.chunkIndexBuilder = new ChunkIndexBuilder();
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

    // Step 1: Build chunk index from project state
    const chunkIndex = this.chunkIndexBuilder.build(projectState);
    logger.debug('Built chunk index', {
      chunkCount: chunkIndex.chunks.size,
      fileCount: chunkIndex.fileMetadata.size,
    });

    // Step 2: Generate file tree metadata for planning call
    const metadata = generateFileTreeMetadata(chunkIndex);
    logger.debug('Generated metadata', { metadataLength: metadata.length });

    // Step 3: Call AI for planning (or fall back to heuristics)
    let plannerResult: FilePlannerResult;

    if (this.geminiClient) {
      plannerResult = await this.callPlanningAI(prompt, metadata, chunkIndex, projectState);
    } else {
      logger.info('No Gemini client available, using fallback selector');
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

      const response = await this.geminiClient!.generate({
        prompt: planningPrompt,
        systemInstruction: PLANNING_SYSTEM_PROMPT,
        temperature: PLANNING_TEMPERATURE,
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
   * Find a chunk by symbol name.
   */
  private findChunkBySymbol(
    symbolName: string,
    chunkIndex: ChunkIndex
  ): { filePath: string; signature: string; symbolName: string } | null {
    for (const [, chunk] of chunkIndex.chunks) {
      if (chunk.symbolName === symbolName && chunk.isExported) {
        return {
          filePath: chunk.filePath,
          signature: chunk.signature,
          symbolName: chunk.symbolName,
        };
      }
    }
    return null;
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
 * If no GeminiClient is provided, attempts to create one from environment.
 * Falls back to heuristic-only mode if Gemini is unavailable.
 */
export function createFilePlanner(geminiClient?: GeminiClient): FilePlanner {
  if (geminiClient) {
    return new FilePlanner(geminiClient);
  }

  // Try to create a Gemini client from environment
  try {
    const client = createGeminiClient();
    return new FilePlanner(client);
  } catch (error) {
    logger.warn('Could not create Gemini client, using fallback-only mode', {
      error: error instanceof Error ? error.message : String(error),
    });
    return new FilePlanner();
  }
}
