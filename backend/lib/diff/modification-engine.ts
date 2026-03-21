/**
 * @module diff/modification-engine
 * @description Orchestrates context-aware code modifications via the 4-stage pipeline:
 * 1. FilePlanner selects relevant code slices
 * 2. Pipeline runs Intent → Planning → Execution → Review stages
 * 3. Modify/delete ops from the executor are applied via applyFileEdits
 * 4. Build validation with auto-retry (bugfix provider)
 *
 * @requires ../core/pipeline-orchestrator - PipelineOrchestrator class
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
import type { IPromptProvider } from '../core/prompts/prompt-provider';
import { createPromptProvider } from '../core/prompts/prompt-provider-factory';
import { getEffectiveProvider } from '../ai/provider-config-store';
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
import { validateAndFixBuild } from './build-fixer';
import { applyFileEdits } from './file-edit-applicator';
import type { PipelineCallbacks, GeneratedFile, PipelineResult, PipelineStage } from '../core/pipeline-orchestrator';
import { PipelineOrchestrator } from '../core/pipeline-orchestrator';
import { createPipelineOrchestrator } from '../core/pipeline-factory';

const logger = createLogger('ModificationEngine');

const DESIGN_SYSTEM_CATEGORIES = new Set(['ui', 'style', 'mixed']);

export type ModificationPhase =
  | 'intent'
  | 'planning'
  | 'generating'
  | 'reviewing'
  | 'applying'
  | 'validating'
  | 'build-fixing';

export type OnProgressCallback = (phase: ModificationPhase, label: string) => void;

/**
 * Modification Engine service for modifying existing projects.
 * Uses the 4-stage pipeline (Intent → Planning → Execution → Review).
 */
export class ModificationEngine {
  private readonly validationPipeline: ValidationPipeline;
  private readonly filePlanner: FilePlanner;
  private readonly buildValidator: BuildValidator;
  private readonly maxBuildRetries = 2;

  constructor(
    private readonly pipeline: PipelineOrchestrator,
    private readonly bugfixProvider: AIProvider,
    private readonly promptProvider: IPromptProvider,
  ) {
    this.validationPipeline = new ValidationPipeline();
    this.filePlanner = createFilePlanner(this.bugfixProvider);
    this.buildValidator = createBuildValidator();
  }

  /**
   * Modify an existing project based on a user prompt.
   * @param projectState - The current project state with files
   * @param prompt - The modification prompt
   * @param options - Optional configuration
   */
  async modifyProject(
    projectState: ProjectState,
    prompt: string,
    options?: {
      shouldSkipPlanning?: boolean;
      errorContext?: ErrorContext;
      requestId?: string;
      onProgress?: OnProgressCallback;
      onPipelineStage?: (data: { stage: PipelineStage; label: string; status: 'start' | 'complete' | 'degraded' }) => void;
      conversationHistory?: ConversationTurn[];
    }
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
    const onPipelineStage = options?.onPipelineStage;

    try {
      // Step 1: Select code slices
      onProgress?.('planning', 'Analyzing project and planning changes...');
      const skipPlanning = options?.shouldSkipPlanning || shouldSkipPlanningHeuristic(prompt, projectState);
      const { slices, category } = await this.selectCodeSlices(
        projectState, prompt, skipPlanning, options?.errorContext
      );

      // Step 2: Determine design system inclusion
      const shouldIncludeDesignSystem = DESIGN_SYSTEM_CATEGORIES.has(category);
      contextLogger.debug('Category determined', { category, shouldIncludeDesignSystem });

      // Step 3: Build pipeline callbacks
      const pipelineCallbacks: PipelineCallbacks = {
        onStageStart: (stage, label) => {
          contextLogger.debug('Pipeline stage start', { stage, label });
          onPipelineStage?.({ stage, label, status: 'start' });
          if (stage === 'intent') onProgress?.('intent', label);
          else if (stage === 'planning') onProgress?.('planning', label);
          else if (stage === 'execution') onProgress?.('generating', 'Generating code modifications...');
          else if (stage === 'review') onProgress?.('reviewing', 'Reviewing changes...');
        },
        onStageComplete: (stage) => {
          contextLogger.debug('Pipeline stage complete', { stage });
          onPipelineStage?.({ stage, label: '', status: 'complete' });
        },
        onStageFailed: (stage, error) => {
          contextLogger.warn('Pipeline stage failed (degraded)', { stage, error });
          onPipelineStage?.({ stage, label: error, status: 'degraded' });
        },
        signal: undefined, // ModificationEngine doesn't have an abort signal from options
      };

      // Step 4: Run the 4-stage modification pipeline
      onProgress?.('generating', 'Generating code modifications...');
      const pipelineResult = await this.pipeline.runModificationPipeline(
        prompt,
        projectState.files,
        slices,
        pipelineCallbacks,
        { requestId, designSystem: shouldIncludeDesignSystem }
      );

      // Step 5: Resolve final files (apply modify ops + build diff vs currentFiles)
      onProgress?.('applying', 'Applying modifications...');
      const { updatedFiles, deletedFiles } = await this.resolveModifications(
        projectState.files,
        pipelineResult
      );

      // Step 6: Validate AI output against the full merged project (not just changed files)
      // Validating only updatedFiles causes false failures: structure validators always require
      // package.json and an entry point, which won't be present in a single-file patch.
      onProgress?.('validating', 'Validating generated code...');
      const mergedForValidation: Record<string, string | null> = {
        ...projectState.files,
        ...updatedFiles,
      };
      const validationResult = await this.validateModifiedFiles(mergedForValidation);
      if (!validationResult.valid) {
        return {
          success: false,
          error: 'AI output failed validation',
          validationErrors: validationResult.errors,
        };
      }

      // Step 7: Build validation with auto-retry
      onProgress?.('validating', 'Running build validation...');
      const buildValidationResult = await validateAndFixBuild(
        projectState,
        updatedFiles,
        prompt,
        shouldIncludeDesignSystem,
        this.bugfixProvider,
        this.buildValidator,
        this.maxBuildRetries,
        requestId,
        onProgress
      );

      const finalUpdatedFiles = buildValidationResult.updatedFiles;

      // Step 8: Create final result
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
   * Resolve the pipeline result into a diff (updatedFiles + deletedFiles) by:
   * 1. Using finalFiles (create/replace_file + review corrections) as the base
   * 2. Applying any search/replace modify ops from executorFiles
   * 3. Diffing the result against currentFiles
   */
  private async resolveModifications(
    currentFiles: Record<string, string>,
    pipelineResult: PipelineResult
  ): Promise<{ updatedFiles: Record<string, string | null>; deletedFiles: string[] }> {
    // Start from finalFiles (create/replace_file applied + review corrections)
    const fileMap = new Map<string, string>(
      pipelineResult.finalFiles.map(f => [f.path, f.content])
    );

    // Collect and apply modify operations from executorFiles
    const modifyOps = this.extractModifyOps(pipelineResult.executorFiles);
    if (modifyOps.length > 0) {
      const tempState = { files: Object.fromEntries(fileMap) } as ProjectState;
      const editResult = await applyFileEdits(modifyOps, tempState);
      if (editResult.success && editResult.updatedFiles) {
        for (const [path, content] of Object.entries(editResult.updatedFiles)) {
          if (content !== null) {
            fileMap.set(path, content);
          }
        }
      } else {
        logger.warn('Some modify ops failed to apply', { error: editResult.error });
      }
    }

    // Build diff vs currentFiles
    const updatedFiles: Record<string, string | null> = {};
    const deletedFiles: string[] = [];

    // Files deleted: in currentFiles but not in the resolved set
    for (const path of Object.keys(currentFiles)) {
      if (!fileMap.has(path)) {
        updatedFiles[path] = null;
        deletedFiles.push(path);
      }
    }

    // Files changed or newly created
    for (const [path, content] of fileMap) {
      if (currentFiles[path] !== content) {
        updatedFiles[path] = content;
      }
    }

    return { updatedFiles, deletedFiles };
  }

  /**
   * Extract search/replace modify operations from executorFiles.
   * modify/delete ops are stored as JSON-encoded strings by the pipeline.
   */
  private extractModifyOps(
    executorFiles: GeneratedFile[]
  ): Array<{ path: string; operation: string; edits?: Array<{ search: string; replace: string }> }> {
    const ops: Array<{ path: string; operation: string; edits?: Array<{ search: string; replace: string }> }> = [];
    for (const file of executorFiles) {
      if (file.path === '__pipeline_raw__') continue;
      try {
        const op = JSON.parse(file.content);
        if (op && op.operation === 'modify' && Array.isArray(op.edits)) {
          ops.push(op);
        }
      } catch {
        // Not a JSON-encoded op — skip (create/replace_file already in finalFiles)
      }
    }
    return ops;
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
      slices = selectRepairFiles(projectState, errorContext);
      logger.info('Repair mode: selected targeted files', {
        fileCount: slices.length,
        errorType: errorContext.errorType,
      });
    } else if (shouldSkipPlanning) {
      slices = buildSlicesFromFiles(projectState);
      const fileCount = Object.keys(projectState.files).length;
      const budgetManager = new TokenBudgetManager(getTokenBudget(fileCount));
      slices = budgetManager.trimToFit(slices, { chunks: new Map(), chunksByFile: new Map(), fileMetadata: new Map() });
      logger.info('Skipping FilePlanner, using all files as primary', {
        fileCount: slices.length
      });
    } else {
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
 */
function shouldSkipPlanningHeuristic(prompt: string, projectState: ProjectState): boolean {
  const fileCount = Object.keys(projectState.files).length;
  if (fileCount <= 8) {
    logger.info('Skipping planning: small project', { fileCount });
    return true;
  }

  const promptLower = prompt.toLowerCase();
  for (const filePath of Object.keys(projectState.files)) {
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
 * Creates a ModificationEngine with the full pipeline + bugfix provider.
 */
export async function createModificationEngine(): Promise<ModificationEngine> {
  const [pipeline, bugfixProvider, providerName] = await Promise.all([
    createPipelineOrchestrator(),
    createAIProvider('bugfix'),
    getEffectiveProvider(),
  ]);
  const promptProvider = createPromptProvider(providerName);
  return new ModificationEngine(pipeline, bugfixProvider, promptProvider);
}
