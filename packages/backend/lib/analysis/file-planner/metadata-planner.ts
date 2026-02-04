/**
 * Metadata File Planner
 *
 * AI-powered file selection using only file metadata (no content).
 * Uses a metadata-based prompt to select relevant files, with fallback
 * to heuristic selection when AI is unavailable or fails.
 *
 * Requirements: 2.1, 2.3, 2.6, 2.7, 2.8
 */

import type { FileTreeMetadata } from '@ai-app-builder/shared';
import type { GeminiClient } from '../../ai';
import { createGeminiClient } from '../../ai';
import { createLogger } from '../../logger';
import type { FilePlannerResult, PlanningResponse } from './types';
import { buildMetadataBasedPrompt } from './metadata-planning';
import { MetadataFallbackSelector } from './metadata-fallback';
import { PLANNING_SYSTEM_PROMPT, PLANNING_TEMPERATURE, parsePlanningResponse } from './planning-prompt';

const logger = createLogger('metadata-file-planner');

/**
 * MetadataFilePlanner provides AI-powered file selection using only file metadata.
 * Falls back to heuristic selection when AI is unavailable or fails.
 */
export class MetadataFilePlanner {
  private geminiClient: GeminiClient | null;
  private fallbackSelector: MetadataFallbackSelector;

  constructor(geminiClient?: GeminiClient) {
    this.geminiClient = geminiClient ?? null;
    this.fallbackSelector = new MetadataFallbackSelector();
  }

  /**
   * Plan which files to include for a modification based on metadata.
   *
   * @param prompt - The user's modification request
   * @param metadata - Compact file tree metadata (no content)
   * @param projectName - Name of the project for context
   * @returns FilePlannerResult with selected primary and context files
   */
  async plan(
    prompt: string,
    metadata: FileTreeMetadata,
    projectName: string
  ): Promise<FilePlannerResult> {
    logger.info('Starting metadata-based file planning', {
      prompt: prompt.substring(0, 100),
      fileCount: metadata.length,
      projectName,
    });

    // If no Gemini client available, use fallback immediately
    if (!this.geminiClient) {
      logger.info('No Gemini client available, using fallback selector');
      return this.fallbackSelector.select(prompt, metadata);
    }

    // Try AI-based selection
    const result = await this.callPlanningAI(prompt, metadata, projectName);

    logger.info('Metadata planning result', {
      primaryFiles: result.primaryFiles.length,
      contextFiles: result.contextFiles.length,
      usedFallback: result.usedFallback,
    });

    return result;
  }

  /**
   * Call AI to select relevant files based on metadata.
   * Falls back to heuristic selection on any failure.
   */
  private async callPlanningAI(
    prompt: string,
    metadata: FileTreeMetadata,
    projectName: string
  ): Promise<FilePlannerResult> {
    try {
      // Build the metadata-based planning prompt
      const planningPrompt = buildMetadataBasedPrompt(prompt, metadata, projectName);

      logger.info('Sending request to Gemini', {
        promptLength: planningPrompt.length,
        systemInstructionLength: PLANNING_SYSTEM_PROMPT.length,
        temperature: PLANNING_TEMPERATURE,
      });
      logger.debug('Gemini request prompt', {
        prompt: planningPrompt,
        systemInstruction: PLANNING_SYSTEM_PROMPT,
      });

      const response = await this.geminiClient!.generate({
        prompt: planningPrompt,
        systemInstruction: PLANNING_SYSTEM_PROMPT,
        temperature: PLANNING_TEMPERATURE,
      });

      logger.info('Received response from Gemini', {
        success: response.success,
        contentLength: response.content?.length ?? 0,
        hasError: !!response.error,
      });
      logger.debug('Gemini response content', {
        content: response.content,
        error: response.error,
      });

      if (!response.success || !response.content) {
        logger.warn('AI planning call failed', { error: response.error });
        return this.fallbackSelector.select(prompt, metadata);
      }

      // Parse the AI response
      const parsed = this.parseAIResponse(response.content);

      if (!parsed) {
        logger.warn('Failed to parse AI response, using fallback');
        return this.fallbackSelector.select(prompt, metadata);
      }

      // Validate that selected files exist in metadata
      const validatedResult = this.validateFileSelection(parsed, metadata);

      if (validatedResult.primaryFiles.length === 0) {
        logger.warn('No valid primary files selected, using fallback');
        return this.fallbackSelector.select(prompt, metadata);
      }

      return {
        ...validatedResult,
        usedFallback: false,
      };
    } catch (error) {
      logger.error('AI planning call exception', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.fallbackSelector.select(prompt, metadata);
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
   * Validate that selected files exist in the provided metadata.
   */
  private validateFileSelection(
    result: PlanningResponse,
    metadata: FileTreeMetadata
  ): FilePlannerResult {
    // Build a set of valid file paths from metadata
    const validPaths = new Set(metadata.map((f) => f.path));

    const primaryFiles = result.primaryFiles.filter((f) => validPaths.has(f));
    const contextFiles = result.contextFiles.filter((f) => validPaths.has(f));

    // Log any invalid files
    const invalidPrimary = result.primaryFiles.filter((f) => !validPaths.has(f));
    const invalidContext = result.contextFiles.filter((f) => !validPaths.has(f));

    if (invalidPrimary.length > 0 || invalidContext.length > 0) {
      logger.warn('Some selected files do not exist in metadata', {
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
}

/**
 * Create a MetadataFilePlanner instance.
 * If no GeminiClient is provided, attempts to create one from environment.
 * Falls back to heuristic-only mode if Gemini is unavailable.
 */
export function createMetadataFilePlanner(geminiClient?: GeminiClient): MetadataFilePlanner {
  if (geminiClient) {
    return new MetadataFilePlanner(geminiClient);
  }

  // Try to create a Gemini client from environment
  try {
    const client = createGeminiClient();
    return new MetadataFilePlanner(client);
  } catch (error) {
    logger.warn('Could not create Gemini client, using fallback-only mode', {
      error: error instanceof Error ? error.message : String(error),
    });
    return new MetadataFilePlanner();
  }
}
