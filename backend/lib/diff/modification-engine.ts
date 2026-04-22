/**
 * @module diff/modification-engine
 * @description Orchestrates context-aware code modifications via the 4-stage pipeline:
 * 1. FilePlanner selects relevant code slices
 * 2. Pipeline runs Intent → Planning → Execution → Review stages
 * 3. Modify/delete ops from the executor are applied via applyFileEdits
 * 4. Build validation with auto-retry (bugfix provider)
 *
 * @requires ../core/modification-strategy - ModificationStrategy + PipelineResult
 * @requires ../core/unified-pipeline - UnifiedPipeline class
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
import { getTokenBudget, SMALL_PROJECT_FILE_THRESHOLD, SIMPLE_PROMPT_MAX_LENGTH } from '../constants';
import { buildSlicesFromFiles, buildReplaceFileRetryPrompt } from './prompt-builder';
import { selectRepairFiles, type ErrorContext } from './repair-file-selector';
import type { FailedFileEdit } from './file-edit-applicator';
import { extractJsonFromResponse } from '../ai/modal-response-parser';
import { createModificationResult } from './result-builder';
import { DiagnosticRepairEngine } from './diagnostic-repair-engine';
import { CheckpointManager } from './checkpoint-manager';
import { applyFileEdits } from './file-edit-applicator';
import { evaluateDiffSize } from './diff-size-guard';
import type { UnifiedPipelineCallbacks, PipelineStage, GeneratedFile } from '../core/pipeline-shared';
import type { PipelineResult } from '../core/modification-strategy';
import { ModificationStrategy } from '../core/modification-strategy';
import { UnifiedPipeline } from '../core/unified-pipeline';
import { indexProject } from '../analysis/file-index';
import { createDependencyGraph } from '../analysis/dependency-graph';
import { analyzeImpact } from '../analysis/impact-analyzer';
import { createAcceptanceGate } from '../core/acceptance-gate';
import type { PlanOutput } from '../core/schemas';

const logger = createLogger('ModificationEngine');

const DESIGN_SYSTEM_CATEGORIES = new Set(['ui', 'style', 'mixed']);
const SIMPLE_MODIFICATION_VERBS = /\b(change|update|rename|fix|adjust|tweak|set|replace|remove|delete|add|move)\b/i;
const COMPLEX_MODIFICATION_CUES = /\b(refactor|rewrite|restructure|architecture|migrate|overhaul|across the app|entire app|all pages|multiple pages|state management|authentication|database|api layer)\b/i;

export type ModificationPhase =
  | 'intent'
  | 'planning'
  | 'generating'
  | 'applying'
  | 'validating'
  | 'build-fixing';

export type OnProgressCallback = (phase: ModificationPhase, label: string) => void;

export interface ModificationRoutingDecision {
  skipIntent: boolean;
  skipPlanning: boolean;
  preferHeuristicSelection: boolean;
  enforceTargetedChanges: boolean;
  mode: 'repair' | 'direct' | 'scoped' | 'full';
}

/**
 * Minimal interface that the ModificationEngine requires from its pipeline.
 * Implemented by UnifiedPipeline (via legacy aliases) and by test mocks.
 */
export interface IModificationPipeline {
  runModificationPipeline(
    userPrompt: string,
    currentFiles: Record<string, string>,
    fileSlices: CodeSlice[],
    callbacks: UnifiedPipelineCallbacks,
    options?: { requestId?: string; designSystem?: boolean; skipIntent?: boolean; skipPlanning?: boolean; conversationHistory?: ConversationTurn[] }
  ): Promise<PipelineResult>;

  runOrderedModificationPipeline(
    userPrompt: string,
    currentFiles: Record<string, string>,
    tiers: string[][],
    validateFile: (path: string, content: string) => Promise<{ valid: boolean; errorText?: string }>,
    callbacks: UnifiedPipelineCallbacks,
    options?: { requestId?: string; designSystem?: boolean; skipIntent?: boolean; skipPlanning?: boolean; conversationHistory?: ConversationTurn[] }
  ): Promise<PipelineResult>;
}

/**
 * Modification Engine service for modifying existing projects.
 * Uses the 4-stage pipeline (Intent → Planning → Execution → Review).
 */
export class ModificationEngine {
  private readonly validationPipeline: ValidationPipeline;
  private readonly filePlanner: FilePlanner;
  private readonly buildValidator: BuildValidator;
  private readonly repairEngine: DiagnosticRepairEngine;
  private readonly acceptanceGate = createAcceptanceGate();

  constructor(
    private readonly pipeline: IModificationPipeline,
    private readonly bugfixProvider: AIProvider,
    private readonly promptProvider: IPromptProvider,
  ) {
    this.validationPipeline = new ValidationPipeline();
    this.filePlanner = createFilePlanner(this.bugfixProvider);
    this.buildValidator = createBuildValidator();
    this.repairEngine = new DiagnosticRepairEngine();
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
      _forceFullRouting?: boolean;
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

    const engineStartMs = Date.now();
    contextLogger.info('[MOD-ENGINE] start', {
      promptPreview: prompt.slice(0, 150),
      promptLength: prompt.length,
      fileCount: Object.keys(projectState.files).length,
      projectId: projectState.id,
    });

    try {
      // Step 1: Select code slices
      onProgress?.('planning', 'Analyzing project and planning changes...');
      const fileCount = Object.keys(projectState.files).length;
      const selectionStrategy = determineSelectionStrategy(
        prompt,
        fileCount,
        options?.errorContext,
        options?.shouldSkipPlanning
      );
      const { slices, category } = await this.selectCodeSlices(
        projectState,
        prompt,
        selectionStrategy.preferHeuristicSelection,
        options?.errorContext
      );

      // Step 2: Determine design system inclusion
      const shouldIncludeDesignSystem = DESIGN_SYSTEM_CATEGORIES.has(category);
      contextLogger.info('Code slices selected', {
        category,
        shouldIncludeDesignSystem,
        totalSlices: slices.length,
        primaryFiles: slices.filter(s => s.relevance === 'primary').map(s => s.filePath),
        contextFiles: slices.filter(s => s.relevance === 'context').map(s => s.filePath),
      });

      // Step 2.5: Classify complexity to decide whether to run intent/planning stages
      const routingDecision = options?._forceFullRouting
        ? { skipIntent: false, skipPlanning: false, preferHeuristicSelection: false, enforceTargetedChanges: false, mode: 'full' as const }
        : classifyModificationComplexity(slices, fileCount, options?.errorContext, prompt);
      const explicitOverride = options?.shouldSkipPlanning === true;
      const skipPlanning = explicitOverride || routingDecision.skipPlanning;
      const skipIntent = routingDecision.skipIntent;
      contextLogger.info('Modification routing decision', {
        mode: routingDecision.mode,
        skipIntent,
        skipPlanning,
        preferHeuristicSelection: selectionStrategy.preferHeuristicSelection,
        enforceTargetedChanges: routingDecision.enforceTargetedChanges,
        explicitSkipPlanning: explicitOverride,
        forcedFullRouting: options?._forceFullRouting ?? false,
      });

      // Step 3: Build pipeline callbacks
      const pipelineCallbacks: UnifiedPipelineCallbacks = {
        onStageStart: (stage, label) => {
          contextLogger.debug('Pipeline stage start', { stage, label });
          onPipelineStage?.({ stage: stage as PipelineStage, label, status: 'start' });
          if (stage === 'intent') onProgress?.('intent', label);
          else if (stage === 'planning') onProgress?.('planning', label);
          else if (stage === 'execution') onProgress?.('generating', 'Generating code modifications...');
        },
        onStageComplete: (stage) => {
          contextLogger.debug('Pipeline stage complete', { stage });
          onPipelineStage?.({ stage: stage as PipelineStage, label: '', status: 'complete' });
        },
        onStageFailed: (stage, error) => {
          contextLogger.warn('Pipeline stage failed (degraded)', { stage, error });
          onPipelineStage?.({ stage: stage as PipelineStage, label: error, status: 'degraded' });
        },
        signal: undefined, // ModificationEngine doesn't have an abort signal from options
      };

      // Step 4: Run the 4-stage modification pipeline
      const primaryFiles = slices.filter(s => s.relevance === 'primary').map(s => s.filePath);
      let pipelineResult: PipelineResult;

      if (primaryFiles.length <= 3) {
        onProgress?.('generating', 'Generating code modifications...');
        pipelineResult = await this.pipeline.runModificationPipeline(
          prompt,
          projectState.files,
          slices,
          pipelineCallbacks,
          {
            requestId,
            designSystem: shouldIncludeDesignSystem,
            skipIntent,
            skipPlanning,
            conversationHistory: options?.conversationHistory,
          }
        );
      } else {
        onProgress?.('generating', `Generating code modifications (ordered, ${primaryFiles.length} files)...`);

        const fileIndex = indexProject(projectState);
        const depGraph = createDependencyGraph(fileIndex);
        const impactReport = analyzeImpact(primaryFiles, depGraph);

        const validateFile = async (path: string, content: string) => {
          const tempFiles = { ...projectState.files, [path]: content };
          const validationResult = await this.validateModifiedFiles(tempFiles);
          return {
            valid: validationResult.valid,
            errorText: validationResult.validationErrors.map(e => e.message).join(', ')
          };
        };

        pipelineResult = await this.pipeline.runOrderedModificationPipeline(
          prompt,
          projectState.files,
          impactReport.tiers,
          validateFile,
          pipelineCallbacks,
          {
            requestId,
            designSystem: shouldIncludeDesignSystem,
            skipIntent,
            skipPlanning,
            conversationHistory: options?.conversationHistory,
          }
        );
      }

      // Step 4.5: Capture checkpoint before applying modifications (for rollback)
      const checkpointMgr = new CheckpointManager();
      const filesToModify = pipelineResult.finalFiles.map(f => f.path);
      checkpointMgr.capture(projectState.files, filesToModify);

      // Step 5: Resolve final files (apply modify ops + build diff vs currentFiles)
      onProgress?.('applying', 'Applying modifications...');
      const { updatedFiles, deletedFiles } = await this.resolveModifications(
        projectState.files,
        pipelineResult,
        { userPrompt: prompt, designSystem: shouldIncludeDesignSystem }
      );
      // updatedFiles already includes deleted paths (as null values) — no need to spread deletedFiles
      const changedPaths = Object.keys(updatedFiles);
      if (routingDecision.enforceTargetedChanges) {
        const unexpectedFiles = this.findUnexpectedChangedFiles(changedPaths, slices, prompt, projectState.files);
        if (unexpectedFiles.length > 0) {
          contextLogger.warn('Scoped modification touched unexpected files — degrading to full routing', {
            mode: routingDecision.mode,
            changedPaths,
            unexpectedFiles,
          });
          return this.modifyProject(projectState, prompt, { ...options, _forceFullRouting: true });
        }
      }

      // Step 5.5: Diff size guard — auto-convert modify ops that changed >90% of a file
      for (const [path, content] of Object.entries(updatedFiles)) {
        if (content === null) continue; // deletion
        const original = projectState.files[path];
        if (!original) continue; // new file (create), not a modify
        const result = evaluateDiffSize(original, content, 'modify');
        if (result.verdict === 'converted') {
          contextLogger.info('Diff guard: auto-converted modify to replace_file', {
            file: path,
            changeRatio: result.changeRatio.toFixed(2),
          });
        }
        // No action needed on the content — it's already the final content.
        // The guard is informational + logged for observability.
      }

      // Step 6: Validate AI output against the full merged project (not just changed files)
      onProgress?.('validating', 'Validating generated code...');
      const mergedForValidation: Record<string, string | null> = {
        ...projectState.files,
        ...updatedFiles,
      };

      const validationResult = await this.validateModifiedFiles(mergedForValidation);
      if (!validationResult.valid) {
        return {
          success: false,
          error: 'AI output failed acceptance',
          validationErrors: validationResult.validationErrors,
        };
      }

      // Step 7: Diagnostic repair engine (replaces build-fixer)
      onProgress?.('validating', 'Running build validation...');
      const repairResult = await this.repairEngine.repair({
        projectState,
        updatedFiles,
        prompt,
        shouldIncludeDesignSystem,
        aiProvider: this.bugfixProvider,
        buildValidator: this.buildValidator,
        acceptanceGate: this.acceptanceGate,
        checkpoint: checkpointMgr.rollbackAll(),
        requestId,
      });

      if (repairResult.repairLevel !== 'deterministic' || !repairResult.success) {
        contextLogger.info('Repair engine result', {
          success: repairResult.success,
          partialSuccess: repairResult.partialSuccess,
          repairLevel: repairResult.repairLevel,
          totalAICalls: repairResult.totalAICalls,
          rolledBackFiles: repairResult.rolledBackFiles,
        });
      }

      if (repairResult.repairLevel === 'targeted-ai' || repairResult.repairLevel === 'broad-ai') {
        onProgress?.('build-fixing', `Fixed build errors (${repairResult.repairLevel}, ${repairResult.totalAICalls} AI calls)`);
      }

      const finalUpdatedFiles = repairResult.updatedFiles;

      const changedFiles = Object.entries(finalUpdatedFiles)
        .filter(([, v]) => v !== null)
        .map(([k]) => k);

      contextLogger.info('[MOD-ENGINE] complete', {
        durationMs: Date.now() - engineStartMs,
        changedFileCount: changedFiles.length,
        changedFiles,
        deletedFileCount: deletedFiles.length,
        deletedFiles,
        repairLevel: repairResult.repairLevel,
        partialSuccess: repairResult.partialSuccess ?? false,
      });

      // Step 8: Create final result
      onProgress?.('applying', 'Finalizing changes...');
      return await createModificationResult(projectState, finalUpdatedFiles, deletedFiles, prompt, {
        partialSuccess: repairResult.partialSuccess,
        rolledBackFiles: repairResult.rolledBackFiles,
      });
    } catch (error) {
      contextLogger.error('[MOD-ENGINE] failed', {
        durationMs: Date.now() - engineStartMs,
        error: error instanceof Error ? error.message : String(error),
      });
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
   * 3. Auto-retrying failed edits with replace_file fallback
   * 4. Diffing the result against currentFiles
   */
  private async resolveModifications(
    currentFiles: Record<string, string>,
    pipelineResult: PipelineResult,
    fallbackOptions?: { userPrompt: string; designSystem: boolean }
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

      // Always apply updates (both successful and partial for failed files)
      if (editResult.updatedFiles) {
        for (const [path, content] of Object.entries(editResult.updatedFiles)) {
          if (content !== null) {
            fileMap.set(path, content);
          }
        }
      }

      // Auto replace_file fallback for failed edits
      if (editResult.failedFileEdits && editResult.failedFileEdits.length > 0) {
        if (fallbackOptions) {
          logger.info('Attempting replace_file fallback for failed edits', {
            failedFiles: editResult.failedFileEdits.map(f => f.path),
          });
          const fallbackFiles = await this.retryWithReplaceFileFallback(
            editResult.failedFileEdits,
            fallbackOptions.userPrompt,
            fallbackOptions.designSystem,
            currentFiles
          );
          for (const file of fallbackFiles) {
            fileMap.set(file.path, file.content);
          }
        } else {
          logger.warn('Modify ops failed, no fallback available', {
            failedFiles: editResult.failedFileEdits.map(f => f.path),
          });
        }
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

    // Warn if pipeline produced files but nothing actually changed
    const hasExecutorContent = pipelineResult.executorFiles.some(
      f => f.path !== '__pipeline_raw__'
    );
    if (hasExecutorContent && Object.keys(updatedFiles).length === 0) {
      logger.warn('Pipeline produced files but resolved to 0 changes', {
        executorFileCount: pipelineResult.executorFiles.length,
        finalFileCount: pipelineResult.finalFiles.length,
        modifyOpsCount: modifyOps.length,
      });
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
   * Retry failed search/replace edits by asking the AI to return complete file content
   * using replace_file.
   */
  private async retryWithReplaceFileFallback(
    failedFileEdits: FailedFileEdit[],
    userPrompt: string,
    designSystem: boolean,
    currentFiles: Record<string, string>,
  ): Promise<GeneratedFile[]> {
    const retryPrompt = buildReplaceFileRetryPrompt(userPrompt, failedFileEdits);
    const systemInstruction = this.promptProvider.getExecutionModificationSystemPrompt(
      userPrompt, null, null, designSystem
    );

    try {
      const response = await this.bugfixProvider.generate({
        prompt: retryPrompt,
        systemInstruction,
        maxOutputTokens: this.promptProvider.tokenBudgets.executionModification,
      });

      if (!response.success || !response.content) {
        logger.warn('Replace_file fallback AI call failed', { error: response.error });
        return [];
      }

      const jsonStr = extractJsonFromResponse(response.content);
      if (!jsonStr) {
        logger.warn('Replace_file fallback: could not extract JSON from response');
        return [];
      }

      const parsed = JSON.parse(jsonStr);
      const files = Array.isArray(parsed?.files) ? parsed.files
        : Array.isArray(parsed) ? parsed
        : typeof parsed?.path === 'string' ? [parsed] : [];

      // Only accept paths we were asked to retry AND that exist in currentFiles
      const allowedPaths = new Set(failedFileEdits.map(f => f.path));
      const result: GeneratedFile[] = [];
      for (const file of files) {
        if (typeof file.path === 'string' && typeof file.content === 'string'
          && allowedPaths.has(file.path) && file.path in currentFiles) {
          result.push({ path: file.path, content: file.content });
        }
      }

      logger.info('Replace_file fallback succeeded', {
        recoveredFiles: result.map(f => f.path),
        failedFiles: failedFileEdits.map(f => f.path),
      });

      return result;
    } catch (err) {
      logger.warn('Replace_file fallback failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
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
      slices = selectRepairFiles(projectState, errorContext);
      logger.info('Repair mode: selected targeted files', {
        fileCount: slices.length,
        errorType: errorContext.errorType,
      });
    } else if (shouldSkipPlanning) {
      slices = selectFilesHeuristically(projectState, prompt);
      const fileCount = Object.keys(projectState.files).length;
      const budgetManager = new TokenBudgetManager(getTokenBudget(fileCount));
      slices = budgetManager.trimToFit(slices, { chunks: new Map(), chunksByFile: new Map(), fileMetadata: new Map() });
      logger.info('Skipping FilePlanner, using heuristic file selection', {
        fileCount,
        primaryCount: slices.filter(s => s.relevance === 'primary').length,
        contextCount: slices.filter(s => s.relevance === 'context').length,
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
    updatedFiles: Record<string, string | null>,
    _changedPaths?: string[],
  ): Promise<{ valid: boolean; validationErrors: any[]; issues: any[] }> {
    const filesToValidate: Record<string, string> = {};
    for (const [path, content] of Object.entries(updatedFiles)) {
      if (content !== null) {
        filesToValidate[path] = content;
      }
    }

    const acceptanceResult = this.acceptanceGate.lightValidate(filesToValidate);
    return {
      valid: acceptanceResult.valid,
      validationErrors: acceptanceResult.validationErrors,
      issues: acceptanceResult.issues,
    };
  }

  private findUnexpectedChangedFiles(
    changedPaths: string[],
    slices: CodeSlice[],
    prompt: string,
    originalFiles: Record<string, string>
  ): string[] {
    const allowedPaths = new Set(slices.map((slice) => slice.filePath));

    return changedPaths.filter((path) => {
      if (allowedPaths.has(path)) {
        return false;
      }

      if (isAllowedSupportFile(path, prompt, originalFiles)) {
        return false;
      }

      return true;
    });
  }
}

/**
 * Classifies modification complexity to decide whether to skip intent and/or planning stages.
 */
export function classifyModificationComplexity(
  slices: CodeSlice[],
  projectFileCount: number,
  errorContext?: ErrorContext,
  prompt: string = '',
): ModificationRoutingDecision {
  if (errorContext) {
    logger.info('Complexity: skip both (repair mode)');
    return {
      skipIntent: true,
      skipPlanning: true,
      preferHeuristicSelection: true,
      enforceTargetedChanges: false,
      mode: 'repair',
    };
  }

  const primaryCount = slices.filter(s => s.relevance === 'primary').length;
  const simplePrompt = isLikelySimpleModificationPrompt(prompt);

  if (primaryCount > 0 && primaryCount <= 2 && simplePrompt && projectFileCount <= SMALL_PROJECT_FILE_THRESHOLD) {
    logger.info('Complexity: direct route for simple scoped modification', { primaryCount, projectFileCount });
    return {
      skipIntent: true,
      skipPlanning: true,
      preferHeuristicSelection: projectFileCount <= SMALL_PROJECT_FILE_THRESHOLD,
      enforceTargetedChanges: true,
      mode: 'direct',
    };
  }

  if (primaryCount > 0 && primaryCount <= 2 && projectFileCount <= SMALL_PROJECT_FILE_THRESHOLD && !COMPLEX_MODIFICATION_CUES.test(prompt)) {
    logger.info('Complexity: scoped route for small modification', { primaryCount, projectFileCount });
    return {
      skipIntent: true,
      skipPlanning: false,
      preferHeuristicSelection: false,
      enforceTargetedChanges: true,
      mode: 'scoped',
    };
  }

  logger.info('Complexity: full route for standard modification flow', { primaryCount, projectFileCount });
  return {
    skipIntent: false,
    skipPlanning: false,
    preferHeuristicSelection: false,
    enforceTargetedChanges: false,
    mode: 'full',
  };
}

function determineSelectionStrategy(
  prompt: string,
  projectFileCount: number,
  errorContext?: ErrorContext,
  shouldSkipPlanning?: boolean
): Pick<ModificationRoutingDecision, 'preferHeuristicSelection'> {
  if (errorContext || shouldSkipPlanning) {
    return { preferHeuristicSelection: true };
  }

  if (projectFileCount <= SMALL_PROJECT_FILE_THRESHOLD && isLikelySimpleModificationPrompt(prompt)) {
    return { preferHeuristicSelection: true };
  }

  return { preferHeuristicSelection: false };
}

function isLikelySimpleModificationPrompt(prompt: string): boolean {
  const normalized = prompt.trim();
  if (normalized.length === 0 || normalized.length > SIMPLE_PROMPT_MAX_LENGTH) {
    return false;
  }

  if (COMPLEX_MODIFICATION_CUES.test(normalized)) {
    return false;
  }

  return SIMPLE_MODIFICATION_VERBS.test(normalized);
}

function isAllowedSupportFile(path: string, prompt: string, originalFiles?: Record<string, string>): boolean {
  if (path === 'package.json') {
    return true;
  }

  if (/\.(ts|tsx|css|scss|js|jsx)$/.test(path) && !path.includes('node_modules')) {
    if (originalFiles) {
      return !(path in originalFiles); // only new files are allowed
    }
    return true;
  }

  const normalized = prompt.toLowerCase();
  if ((path === 'package-lock.json' || path.endsWith('/package-lock.json')) && /\b(package|dependency|install|library)\b/.test(normalized)) {
    return true;
  }

  return false;
}

/**
 * Heuristic file selection for small projects or repair mode (no AI FilePlanner call).
 */
function selectFilesHeuristically(projectState: ProjectState, prompt: string): CodeSlice[] {
  const promptLower = prompt.toLowerCase();
  const allFiles = Object.entries(projectState.files);

  const matchedPaths = new Set<string>();
  for (const [path] of allFiles) {
    const fileName = path.split('/').pop() ?? '';
    const baseName = fileName.replace(/\.[^.]+$/, '');
    if (baseName.length >= 3 && new RegExp(`\\b${baseName.toLowerCase()}\\b`).test(promptLower)) {
      matchedPaths.add(path);
    }
  }

  if (matchedPaths.size === 0) {
    return allFiles.map(([filePath, content]) => ({ filePath, content, relevance: 'primary' as const }));
  }

  return allFiles.map(([filePath, content]) => ({
    filePath,
    content,
    relevance: matchedPaths.has(filePath) ? 'primary' as const : 'context' as const,
  }));
}

/**
 * Adapter that wraps a UnifiedPipeline and makes it implement IModificationPipeline.
 * Constructs a new ModificationStrategy per call, injecting currentFiles/fileSlices/tiers at runtime.
 */
class ModificationPipelineAdapter implements IModificationPipeline {
  constructor(
    private readonly intentProvider: AIProvider,
    private readonly planningProvider: AIProvider,
    private readonly executionProvider: AIProvider,
    private readonly promptProvider: IPromptProvider,
  ) {}

  async runModificationPipeline(
    userPrompt: string,
    currentFiles: Record<string, string>,
    fileSlices: CodeSlice[],
    callbacks: UnifiedPipelineCallbacks,
    options?: { requestId?: string; designSystem?: boolean; skipIntent?: boolean; skipPlanning?: boolean; conversationHistory?: ConversationTurn[] }
  ): Promise<PipelineResult> {
    const strategy = new ModificationStrategy(
      this.planningProvider,
      this.executionProvider,
      this.promptProvider,
      currentFiles,
      fileSlices,
    );
    const pipeline = new UnifiedPipeline<PlanOutput, PipelineResult>(
      this.intentProvider,
      this.promptProvider,
      strategy,
    );
    return pipeline.run(userPrompt, callbacks, {
      requestId: options?.requestId,
      designSystem: options?.designSystem,
      skipIntent: options?.skipIntent,
      skipPlanning: options?.skipPlanning,
      conversationHistoryPrefix: options?.conversationHistory,
    });
  }

  async runOrderedModificationPipeline(
    userPrompt: string,
    currentFiles: Record<string, string>,
    tiers: string[][],
    validateFile: (path: string, content: string) => Promise<{ valid: boolean; errorText?: string }>,
    callbacks: UnifiedPipelineCallbacks,
    options?: { requestId?: string; designSystem?: boolean; skipIntent?: boolean; skipPlanning?: boolean; conversationHistory?: ConversationTurn[] }
  ): Promise<PipelineResult> {
    const strategy = new ModificationStrategy(
      this.planningProvider,
      this.executionProvider,
      this.promptProvider,
      currentFiles,
      [], // fileSlices not needed for ordered execution
      tiers,
      validateFile,
    );
    const pipeline = new UnifiedPipeline<PlanOutput, PipelineResult>(
      this.intentProvider,
      this.promptProvider,
      strategy,
    );
    return pipeline.run(userPrompt, callbacks, {
      requestId: options?.requestId,
      designSystem: options?.designSystem,
      skipIntent: options?.skipIntent,
      skipPlanning: options?.skipPlanning,
      conversationHistoryPrefix: options?.conversationHistory,
    });
  }
}

/**
 * Creates a ModificationEngine with the full pipeline + bugfix provider.
 * Pass overrideProvider to use a workspace-specific API key for all stages.
 */
export async function createModificationEngine(overrideProvider?: AIProvider): Promise<ModificationEngine> {
  if (overrideProvider) {
    // Workspace mode: single provider for all stages (v1 — no per-task routing)
    const providerName = await getEffectiveProvider();
    const promptProvider = createPromptProvider(providerName);
    const adapter = new ModificationPipelineAdapter(
      overrideProvider, overrideProvider, overrideProvider, promptProvider
    );
    return new ModificationEngine(adapter, overrideProvider, promptProvider);
  }
  const [intentProvider, planningProvider, executionProvider, bugfixProvider, providerName] = await Promise.all([
    createAIProvider('intent'),
    createAIProvider('planning'),
    createAIProvider('execution'),
    createAIProvider('bugfix'),
    getEffectiveProvider(),
  ]);
  const promptProvider = createPromptProvider(providerName);
  const adapter = new ModificationPipelineAdapter(
    intentProvider, planningProvider, executionProvider, promptProvider
  );
  return new ModificationEngine(adapter, bugfixProvider, promptProvider);
}
