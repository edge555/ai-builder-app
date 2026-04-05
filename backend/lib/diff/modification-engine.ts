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
import { buildSlicesFromFiles, buildReplaceFileRetryPrompt } from './prompt-builder';
import { selectRepairFiles, type ErrorContext } from './repair-file-selector';
import type { FailedFileEdit } from './file-edit-applicator';
import { extractJsonFromResponse } from '../ai/modal-response-parser';
import { createModificationResult } from './result-builder';
import { DiagnosticRepairEngine } from './diagnostic-repair-engine';
import { CheckpointManager } from './checkpoint-manager';
import { applyFileEdits } from './file-edit-applicator';
import { evaluateDiffSize } from './diff-size-guard';
import type { PipelineCallbacks, GeneratedFile, PipelineResult, PipelineStage } from '../core/pipeline-orchestrator';
import { PipelineOrchestrator } from '../core/pipeline-orchestrator';
import { createPipelineOrchestrator } from '../core/pipeline-factory';
import { indexProject } from '../analysis/file-index';
import { createDependencyGraph } from '../analysis/dependency-graph';
import { analyzeImpact } from '../analysis/impact-analyzer';
import { createAcceptanceGate } from '../core/acceptance-gate';

const logger = createLogger('ModificationEngine');

const DESIGN_SYSTEM_CATEGORIES = new Set(['ui', 'style', 'mixed']);

export type ModificationPhase =
  | 'intent'
  | 'planning'
  | 'generating'
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
  private readonly repairEngine: DiagnosticRepairEngine;
  private readonly acceptanceGate = createAcceptanceGate();

  constructor(
    private readonly pipeline: PipelineOrchestrator,
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
      const skipFilePlanner = !!options?.errorContext;
      const { slices, category } = await this.selectCodeSlices(
        projectState, prompt, skipFilePlanner, options?.errorContext
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
      const { skipIntent, skipPlanning } = classifyModificationComplexity(
        slices,
        fileCount,
        options?.errorContext
      );

      // Step 3: Build pipeline callbacks
      const pipelineCallbacks: PipelineCallbacks = {
        onStageStart: (stage, label) => {
          contextLogger.debug('Pipeline stage start', { stage, label });
          onPipelineStage?.({ stage, label, status: 'start' });
          if (stage === 'intent') onProgress?.('intent', label);
          else if (stage === 'planning') onProgress?.('planning', label);
          else if (stage === 'execution') onProgress?.('generating', 'Generating code modifications...');
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
      const primaryFiles = slices.filter(s => s.relevance === 'primary').map(s => s.filePath);
      let pipelineResult: PipelineResult;

      if (primaryFiles.length <= 3) {
        onProgress?.('generating', 'Generating code modifications...');
        pipelineResult = await this.pipeline.runModificationPipeline(
          prompt,
          projectState.files,
          slices,
          pipelineCallbacks,
          { requestId, designSystem: shouldIncludeDesignSystem, skipIntent, skipPlanning }
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
            errorText: validationResult.errors.map(e => e.message).join(', ')
          };
        };

        pipelineResult = await this.pipeline.runOrderedModificationPipeline(
          prompt,
          projectState.files,
          impactReport.tiers,
          validateFile,
          pipelineCallbacks,
          { requestId, designSystem: shouldIncludeDesignSystem, skipIntent, skipPlanning }
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
   * using replace_file. This is the highest-leverage fallback — eliminates the entire
   * "match failure" class at the cost of 1 extra AI call per batch of failed files.
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
      // — prevent AI from overwriting unrelated files or creating new files via fallback
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
    updatedFiles: Record<string, string | null>
  ): Promise<{ valid: boolean; validationErrors: any[]; issues: any[] }> {
    const filesToValidate: Record<string, string> = {};
    for (const [path, content] of Object.entries(updatedFiles)) {
      if (content !== null) {
        filesToValidate[path] = content;
      }
    }
    const acceptanceResult = this.acceptanceGate.validate(filesToValidate);
    return {
      valid: acceptanceResult.valid,
      validationErrors: acceptanceResult.validationErrors,
      issues: acceptanceResult.issues,
    };
  }
}

/**
 * Classifies modification complexity to decide whether to skip intent and/or planning stages.
 *
 * Rules:
 * - errorContext present (repair mode) → skip both
 * - all normal modification requests → run both
 */
export function classifyModificationComplexity(
  slices: CodeSlice[],
  projectFileCount: number,
  errorContext?: ErrorContext,
): { skipIntent: boolean; skipPlanning: boolean } {
  if (errorContext) {
    logger.info('Complexity: skip both (repair mode)');
    return { skipIntent: true, skipPlanning: true };
  }

  const primaryCount = slices.filter(s => s.relevance === 'primary').length;
  logger.info('Complexity: run both for standard modification flow', { primaryCount, projectFileCount });
  return { skipIntent: false, skipPlanning: false };
}

/**
 * Heuristic file selection for small projects or repair mode (no AI FilePlanner call).
 * Matches prompt keywords against file basenames to categorize primary vs context.
 * Falls back to all-primary if no matches found.
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

  // Fallback: all primary if no keyword matches
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
 * Creates a ModificationEngine with the full pipeline + bugfix provider.
 * Pass overrideProvider to use a workspace-specific API key for all stages.
 */
export async function createModificationEngine(overrideProvider?: AIProvider): Promise<ModificationEngine> {
  if (overrideProvider) {
    // Workspace mode: single provider for all stages (v1 — no per-task routing)
    const providerName = await getEffectiveProvider();
    const promptProvider = createPromptProvider(providerName);
    const pipeline = new PipelineOrchestrator(
      overrideProvider, overrideProvider, overrideProvider, promptProvider
    );
    return new ModificationEngine(pipeline, overrideProvider, promptProvider);
  }
  const [pipeline, bugfixProvider, providerName] = await Promise.all([
    createPipelineOrchestrator(),
    createAIProvider('bugfix'),
    getEffectiveProvider(),
  ]);
  const promptProvider = createPromptProvider(providerName);
  return new ModificationEngine(pipeline, bugfixProvider, promptProvider);
}
