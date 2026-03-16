/**
 * @module diff/modification-engine
 * @description Orchestrates context-aware code modifications by:
 * 1. Classifying user intent
 * 2. Selecting relevant code slices via file-planner
 * 3. Sending only relevant context to the AI provider
 * 4. Validating and applying changes (with build-error auto-retry)
 *
 * Supports multiple modification types: full file replacement, JSON patch,
 * unified diff, and search/replace.
 *
 * @requires ../ai/ai-provider - AIProvider interface for generation and correction
 * @requires ../core/build-validator - Build error detection
 * @requires ../logger - Structured logging
 * @requires @ai-app-builder/shared - ProjectState, ModificationResult types
 */

import type {
  ProjectState,
  ModificationResult,
  ConversationTurn,
} from '@ai-app-builder/shared';
import type { CodeSlice } from '../analysis/file-planner/types';
import type { AIProvider } from '../ai';
import { createAIProvider } from '../ai';
import type { TaskType } from '../ai';
import { ValidationPipeline } from '../core/validation-pipeline';
import { BuildValidator, createBuildValidator } from '../core/build-validator';
import { createLogger } from '../logger';
import {
  FilePlanner,
  createFilePlanner,
  TokenBudgetManager,
} from '../analysis';
import { getTokenBudget } from '../constants';
import { buildSlicesFromFiles } from './prompt-builder';
import { selectRepairFiles, type ErrorContext } from './repair-file-selector';
import { createModificationResult } from './result-builder';
import { generateModifications } from './modification-generator';
import { validateAndFixBuild } from './build-fixer';

const logger = createLogger('ModificationEngine');

const DESIGN_SYSTEM_CATEGORIES = new Set(['ui', 'style', 'mixed']);

export type ModificationPhase = 'planning' | 'generating' | 'applying' | 'validating' | 'build-fixing';

export type OnProgressCallback = (phase: ModificationPhase, label: string) => void;

/**
 * Modification Engine service for modifying existing projects.
 * Includes build validation with auto-retry.
 */
export class ModificationEngine {
  private readonly aiProvider: AIProvider;
  private readonly validationPipeline: ValidationPipeline;
  private readonly filePlanner: FilePlanner;
  private readonly buildValidator: BuildValidator;
  private readonly maxBuildRetries = 2;

  constructor(aiProvider: AIProvider) {
    this.aiProvider = aiProvider;
    this.validationPipeline = new ValidationPipeline();
    this.filePlanner = createFilePlanner(this.aiProvider);
    this.buildValidator = createBuildValidator();
  }

  /**
   * Modify an existing project based on a user prompt.
   * @param projectState - The current project state with files
   * @param prompt - The modification prompt
   * @param options - Optional configuration (e.g., shouldSkipPlanning to bypass FilePlanner)
   */
  async modifyProject(
    projectState: ProjectState,
    prompt: string,
    options?: { shouldSkipPlanning?: boolean; errorContext?: ErrorContext; requestId?: string; onProgress?: OnProgressCallback; conversationHistory?: ConversationTurn[] }
  ): Promise<ModificationResult> {
    if (!prompt || prompt.trim() === '') {
      return {
        success: false,
        error: 'Modification prompt is required',
      };
    }

    if (!projectState || Object.keys(projectState.files).length === 0) {
      return {
        success: false,
        error: 'Project state with files is required',
      };
    }

    const contextLogger = options?.requestId ? logger.withRequestId(options.requestId) : logger;
    const requestId = options?.requestId;
    const onProgress = options?.onProgress;

    try {
      // Step 1: Select code slices and determine category
      onProgress?.('planning', 'Analyzing project and planning changes...');
      const skipPlanning = options?.shouldSkipPlanning || shouldSkipPlanningHeuristic(prompt, projectState);
      const { slices, category } = await this.selectCodeSlices(projectState, prompt, skipPlanning, options?.errorContext);

      // Step 2: Determine if design system should be included based on category
      const shouldIncludeDesignSystem = DESIGN_SYSTEM_CATEGORIES.has(category);
      contextLogger.debug('System instruction determined', { category, shouldIncludeDesignSystem });

      // Step 3: Generate modifications with retry logic
      onProgress?.('generating', 'Generating code modifications...');
      const modificationResult = await generateModifications(
        prompt,
        slices,
        projectState,
        shouldIncludeDesignSystem,
        this.aiProvider,
        requestId,
        options?.conversationHistory
      );

      if (!modificationResult.success || !modificationResult.updatedFiles || !modificationResult.deletedFiles) {
        return {
          success: false,
          error: modificationResult.error ?? 'Modification failed with incomplete output',
        };
      }

      const { updatedFiles, deletedFiles } = modificationResult;

      // Step 4: Validate AI output
      onProgress?.('validating', 'Validating generated code...');
      const validationResult = await this.validateModifiedFiles(updatedFiles);
      if (!validationResult.valid) {
        return {
          success: false,
          error: 'AI output failed validation',
          validationErrors: validationResult.errors,
        };
      }

      // Step 5: Build validation with auto-retry
      onProgress?.('validating', 'Running build validation...');
      const buildValidationResult = await validateAndFixBuild(
        projectState,
        updatedFiles,
        prompt,
        shouldIncludeDesignSystem,
        this.aiProvider,
        this.buildValidator,
        this.maxBuildRetries,
        requestId,
        onProgress
      );

      // Use the potentially updated files from build validation
      const finalUpdatedFiles = buildValidationResult.updatedFiles;

      // Step 6: Create final result with updated project state and metadata
      onProgress?.('applying', 'Finalizing changes...');
      return await createModificationResult(projectState, finalUpdatedFiles, deletedFiles, prompt);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during modification',
      };
    }
  }

  /**
   * Select code slices based on user prompt and planning strategy.
   */
  private async selectCodeSlices(
    projectState: ProjectState,
    prompt: string,
    shouldSkipPlanning?: boolean,
    errorContext?: ErrorContext
  ): Promise<{ slices: CodeSlice[]; category: 'ui' | 'logic' | 'style' | 'mixed' }> {
    let slices: CodeSlice[];
    let category: 'ui' | 'logic' | 'style' | 'mixed' = 'mixed';

    if (shouldSkipPlanning && errorContext) {
      // Repair mode: select only affected files + their dependents/dependencies
      slices = selectRepairFiles(projectState, errorContext);
      logger.info('Repair mode: selected targeted files', {
        fileCount: slices.length,
        errorType: errorContext.errorType,
      });
    } else if (shouldSkipPlanning) {
      // When shouldSkipPlanning is true, treat all provided files as primary files
      // Build slices directly without calling FilePlanner
      slices = buildSlicesFromFiles(projectState);
      const fileCount = Object.keys(projectState.files).length;
      const budgetManager = new TokenBudgetManager(getTokenBudget(fileCount));
      slices = budgetManager.trimToFit(slices, { chunks: new Map(), chunksByFile: new Map(), fileMetadata: new Map() });
      logger.info('Skipping FilePlanner, using all files as primary', {
        fileCount: slices.length
      });
    } else {
      // Use FilePlanner to select relevant code slices and determine category
      // FilePlanner replaces IntentClassifier + SliceSelector with AI-powered file selection
      const planResult = await this.filePlanner.planWithCategory(prompt, projectState);
      slices = planResult.slices;
      category = planResult.category ?? 'mixed';
      logger.info('FilePlanner result', {
        sliceCount: slices.length,
        category,
      });
    }

    return { slices, category };
  }

  /**
   * Validate modified files using the validation pipeline.
   */
  private async validateModifiedFiles(
    updatedFiles: Record<string, string | null>
  ): Promise<{ valid: boolean; errors: any[] }> {
    const filesToValidate: Record<string, string> = {};
    for (const [path, content] of Object.entries(updatedFiles)) {
      if (content !== null) {
        filesToValidate[path] = content;
      }
    }

    return this.validationPipeline.validate(filesToValidate);
  }

}

/**
 * Heuristic to skip the AI planning call for obvious cases.
 * - Small projects (<= 8 files): always skip — fallback heuristic is sufficient
 * - Prompt mentions an existing file/component name: skip
 */
function shouldSkipPlanningHeuristic(prompt: string, projectState: ProjectState): boolean {
  const fileCount = Object.keys(projectState.files).length;
  if (fileCount <= 8) {
    logger.info('Skipping planning: small project', { fileCount });
    return true;
  }

  const promptLower = prompt.toLowerCase();
  for (const filePath of Object.keys(projectState.files)) {
    // Check filename (e.g., "Header.tsx")
    const fileName = filePath.split('/').pop() ?? '';
    const baseName = fileName.replace(/\.[^.]+$/, '');
    if (baseName.length >= 3 && promptLower.includes(baseName.toLowerCase())) {
      logger.info('Skipping planning: prompt mentions file', { file: filePath, baseName });
      return true;
    }
  }

  return false;
}

/**
 * Creates a ModificationEngine instance with the AI provider for the given task type.
 */
export async function createModificationEngine(taskType: TaskType = 'coding'): Promise<ModificationEngine> {
  const aiProvider = await createAIProvider(taskType);
  return new ModificationEngine(aiProvider);
}
