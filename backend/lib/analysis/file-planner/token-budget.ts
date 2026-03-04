/**
 * @module analysis/file-planner/token-budget
 * @description Token budget manager for AI context assembly.
 * Ensures the assembled code slices stay within the configured token limit.
 * Trimming strategy: convert oversized primary slices to outlines first;
 * then drop context slices by size; always keeps at least one primary slice in full.
 *
 * @requires ./types - CodeSlice, ChunkIndex types
 * @requires ../../constants - TOKEN_BUDGET, CHARS_PER_TOKEN
 * @requires ../../logger - Info logging for trim events
 */

import { TOKEN_BUDGET, CHARS_PER_TOKEN } from '../../constants';
import type { CodeSlice, ChunkIndex } from './types';
import { logger } from '../../logger';

/**
 * TokenBudgetManager ensures assembled context stays within token limits.
 */
export class TokenBudgetManager {
  private budget: number;

  constructor(budget?: number) {
    this.budget = budget ?? TOKEN_BUDGET;
  }

  /**
   * Estimate tokens for a string using ~4 chars per token approximation.
   */
  estimateTokens(content: string): number {
    return Math.ceil(content.length / CHARS_PER_TOKEN);
  }

  /**
   * Trim slices to fit within budget.
   * Strategy:
   * 1. Convert lowest-priority primary chunks to outlines
   * 2. Remove context chunks starting from lowest relevance
   * 3. Always keep at least one primary chunk in full
   */
  trimToFit(slices: CodeSlice[], chunkIndex: ChunkIndex): CodeSlice[] {
    if (slices.length === 0) {
      return slices;
    }

    // Calculate current token usage
    let totalTokens = this.calculateTotalTokens(slices);

    // If within budget, return as-is
    if (totalTokens <= this.budget) {
      return slices;
    }

    logger.info(`Token budget exceeded: ${totalTokens} > ${this.budget}, trimming...`);

    // Separate primary and context slices
    const primarySlices = slices.filter((s) => s.relevance === 'primary');
    const contextSlices = slices.filter((s) => s.relevance === 'context');

    // Sort primary slices by content length (longest first - these get converted first)
    const sortedPrimary = [...primarySlices].sort(
      (a, b) => b.content.length - a.content.length
    );

    // Sort context slices by content length (longest first - these get removed first)
    const sortedContext = [...contextSlices].sort(
      (a, b) => b.content.length - a.content.length
    );

    const result: CodeSlice[] = [];
    let currentTokens = 0;

    // Step 1: Always keep at least one primary chunk in full
    if (sortedPrimary.length > 0) {
      // Keep the first primary (shortest after sort reversal would be last, but we want to keep one full)
      // Actually, keep the smallest primary in full to maximize chance of fitting
      const smallestPrimary = [...primarySlices].sort(
        (a, b) => a.content.length - b.content.length
      )[0];

      result.push(smallestPrimary);
      currentTokens += this.estimateTokens(smallestPrimary.content);

      // Process remaining primary slices
      for (const slice of sortedPrimary) {
        if (slice.filePath === smallestPrimary.filePath) {
          continue; // Already added
        }

        const sliceTokens = this.estimateTokens(slice.content);

        if (currentTokens + sliceTokens <= this.budget) {
          // Fits as full content
          result.push(slice);
          currentTokens += sliceTokens;
        } else {
          // Convert to outline
          const outline = this.getOutlineForSlice(slice, chunkIndex);
          const outlineTokens = this.estimateTokens(outline);

          if (currentTokens + outlineTokens <= this.budget) {
            result.push({
              filePath: slice.filePath,
              content: outline,
              relevance: 'context', // Demoted to context
            });
            currentTokens += outlineTokens;
            logger.info(`Converted primary slice ${slice.filePath} to outline`);
          }
          // If outline doesn't fit either, skip this slice
        }
      }
    }

    // Step 2: Add context slices that fit
    for (const slice of sortedContext) {
      const sliceTokens = this.estimateTokens(slice.content);

      if (currentTokens + sliceTokens <= this.budget) {
        result.push(slice);
        currentTokens += sliceTokens;
      }
      // Skip context slices that don't fit
    }

    logger.info(`Trimmed from ${totalTokens} to ${currentTokens} tokens`);

    return result;
  }

  /**
   * Calculate total tokens for all slices.
   */
  private calculateTotalTokens(slices: CodeSlice[]): number {
    return slices.reduce((total, slice) => total + this.estimateTokens(slice.content), 0);
  }

  /**
   * Get outline/signature for a slice from the chunk index.
   */
  private getOutlineForSlice(slice: CodeSlice, chunkIndex: ChunkIndex): string {
    const fileChunks = chunkIndex.chunksByFile.get(slice.filePath);

    if (!fileChunks || fileChunks.length === 0) {
      // No chunks found, create a simple outline
      return this.createSimpleOutline(slice.content, slice.filePath);
    }

    // Build outline from chunk signatures
    const signatures = fileChunks.map((chunk) => chunk.signature);
    const header = `// FILE OUTLINE: ${slice.filePath}\n// (Showing signatures only)\n`;

    return header + signatures.join('\n\n');
  }

  /**
   * Create a simple outline when chunk index doesn't have the file.
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

      // Include exports
      if (trimmed.startsWith('export ')) {
        // For function/class/const exports, just include the declaration line
        if (
          trimmed.match(/^export\s+(default\s+)?(function|class|const|interface|type)\s+/)
        ) {
          outlineLines.push(line);
          outlineLines.push('  // ... implementation ...');
        } else {
          outlineLines.push(line);
        }
        continue;
      }

      // Include standalone function/class/interface/type declarations
      if (
        trimmed.match(/^(async\s+)?function\s+\w+/) ||
        trimmed.match(/^class\s+\w+/) ||
        trimmed.match(/^interface\s+\w+/) ||
        trimmed.match(/^type\s+\w+/)
      ) {
        outlineLines.push(line);
        outlineLines.push('  // ... implementation ...');
      }
    }

    const header = `// FILE OUTLINE: ${filePath}\n// (Showing signatures only)\n`;
    return header + outlineLines.join('\n');
  }
}

/**
 * Create a TokenBudgetManager instance.
 */
export function createTokenBudgetManager(budget?: number): TokenBudgetManager {
  return new TokenBudgetManager(budget);
}
