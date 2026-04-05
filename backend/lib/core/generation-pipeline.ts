/**
 * @module core/generation-pipeline
 * @description The main orchestrator that replaces the legacy Generation path.
 * It manages Intent, Planning, Multi-Phase Execution, Review, and BugFix.
 */

import type { AIProvider } from '../ai/ai-provider';
import type { IPromptProvider, ArchitecturePlan } from './prompts/prompt-provider';
import type { IntentOutput, PlanReviewOutput, PlannedFile, GeneratedFile, PhaseLayer } from './schemas';
import { IntentOutputSchema, ArchitecturePlanSchema, PlanReviewSchema, PlannedFileSchema } from './schemas';
import { toSimpleJsonSchema } from './zod-to-json-schema';
import { createLogger } from '../logger';
import { selectRecipe } from './recipes/recipe-engine';
import { config } from '../config';
import { PhaseExecutor, type PhaseDefinition, type PhaseCallbacks } from './phase-executor';
import { BuildValidator } from './build-validator';
import { buildPhaseContext } from './batch-context-builder';
import type { PhaseContext } from './batch-context-builder';
import { COMPLEXITY_GATE_FILE_THRESHOLD, UI_BATCH_SPLIT_THRESHOLD } from '../constants';
import { getStructuredParseError, parseStructuredOutput } from '../ai/structured-output';

const logger = createLogger('GenerationPipeline');

const INTENT_JSON_SCHEMA = toSimpleJsonSchema(IntentOutputSchema);
const ARCHITECTURE_PLAN_JSON_SCHEMA = toSimpleJsonSchema(ArchitecturePlanSchema);
const PLAN_REVIEW_JSON_SCHEMA = toSimpleJsonSchema(PlanReviewSchema);

export interface PhaseProgressData {
  phase: string;
  phaseIndex: number;
  totalPhases: number;
  filesInPhase: number;
}

export interface PhaseCompleteData {
  phase: string;
  phaseIndex: number;
  filesGenerated: number;
  totalGenerated: number;
  totalPlanned: number;
}

export interface PipelineCallbacks {
  onStageStart?: (stage: string, label: string) => void;
  onStageComplete?: (stage: string) => void;
  onStageFailed?: (stage: string, error: string) => void;
  onProgress?: (accumulatedLength: number) => void;
  onFileStream?: (file: GeneratedFile, isComplete: boolean) => void;
  onPhaseStart?: (data: PhaseProgressData) => void;
  onPhaseComplete?: (data: PhaseCompleteData) => void;
  signal?: AbortSignal;
}

/** Describes a merged execution phase with its file list. */
export interface MergedPhase {
  layer: PhaseLayer;
  files: PlannedFile[];
}

export interface GenerationResult {
  intentOutput: IntentOutput | null;
  architecturePlan: ArchitecturePlan | null;
  complexityRoute: 'one-shot' | 'multi-phase' | null;
  generatedFiles: GeneratedFile[];
  warnings: string[];
}

export class GenerationPipeline {
  private readonly phaseExecutor: PhaseExecutor;

  constructor(
    private readonly intentProvider: AIProvider,
    private readonly planningProvider: AIProvider,
    private readonly executionProvider: AIProvider,
    private readonly reviewProvider: AIProvider,
    readonly bugfixProvider: AIProvider,
    private readonly promptProvider: IPromptProvider,
    buildValidator?: BuildValidator
  ) {
    this.phaseExecutor = new PhaseExecutor(
      this.executionProvider,
      this.promptProvider,
      buildValidator ?? new BuildValidator()
    );
  }

  /**
   * Main entry point for the new multi-phase generation pipeline.
   * Orchestrates the 5 main stages of generation.
   */
  async runGeneration(
    userPrompt: string,
    callbacks: PipelineCallbacks = {},
    options?: { requestId?: string }
  ): Promise<GenerationResult> {
    const contextLogger = options?.requestId ? logger.withRequestId(options.requestId) : logger;

    const pipelineStartMs = Date.now();
    contextLogger.info('[GEN-PIPELINE] start', {
      promptPreview: userPrompt.slice(0, 150),
      promptLength: userPrompt.length,
    });

    // ── Task 5.1: Intent Stage ────────────────────────────────────────────────
    callbacks.onStageStart?.('intent', 'Analyzing your request…');
    const intentStageStartMs = Date.now();
    contextLogger.debug('Intent stage start');

    let intentOutput: IntentOutput | null = null;
    let _intentRawContent: string | undefined;
    try {
      const response = await this.intentProvider.generate({
        prompt: userPrompt,
        systemInstruction: this.promptProvider.getIntentSystemPrompt(),
        maxOutputTokens: this.promptProvider.tokenBudgets.intent,
        responseSchema: INTENT_JSON_SCHEMA,
        signal: callbacks.signal,
      });

      _intentRawContent = response.content ?? undefined;

      if (!response.success || !response.content) {
        throw new Error(response.error ?? 'Intent stage returned empty content');
      }

      const parsedResult = parseStructuredOutput(response.content, IntentOutputSchema, 'IntentOutput');
      if (!parsedResult.success) {
        const parseError = getStructuredParseError(parsedResult);
        throw new Error(parseError);
      }

      intentOutput = parsedResult.data;
      contextLogger.info('Intent stage complete', {
        complexity: intentOutput.complexity,
        durationMs: Date.now() - intentStageStartMs,
      });
      callbacks.onStageComplete?.('intent');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      contextLogger.warn('Intent stage failed (degraded)', {
        error: message,
        stack: err instanceof Error ? err.stack : undefined,
        responsePreview: _intentRawContent ? _intentRawContent.substring(0, 800) : undefined,
        promptLength: userPrompt.length,
      });
      callbacks.onStageFailed?.('intent', message);
    }

    if (callbacks.signal?.aborted) throw new Error('Generation cancelled by client');

    // ── Task 5.2: Planning Stage — fired immediately after intent resolves ─────
    // Fire the planning AI call before recipe selection to minimise latency.
    // Recipe selection is synchronous (<1ms) and completes long before planning finishes.
    callbacks.onStageStart?.('planning', 'Drafting architecture plan…');
    const planningStageStartMs = Date.now();
    contextLogger.debug('Enhanced Planning stage start');

    const planSystemPrompt = this.promptProvider.getArchitecturePlanningPrompt(userPrompt, intentOutput);
    const planningPromise = this.planningProvider.generate({
      prompt: userPrompt,
      systemInstruction: planSystemPrompt,
      maxOutputTokens: this.promptProvider.tokenBudgets.architecturePlanning,
      responseSchema: ARCHITECTURE_PLAN_JSON_SCHEMA,
      signal: callbacks.signal,
    });

    // ── Recipe Selection (runs while planning is in flight) ────────────────────
    const recipe = selectRecipe(intentOutput, {
      fullstackEnabled: config.recipes.fullstackEnabled,
    }, userPrompt);
    contextLogger.info('Recipe selected', { recipeId: recipe.id });
    this.promptProvider.setRecipe?.(recipe);

    // ── Await planning result ─────────────────────────────────────────────────
    let architecturePlan = await this.resolveArchitecturePlan(
      userPrompt,
      intentOutput,
      planningPromise,
      callbacks,
      contextLogger,
      planningStageStartMs
    );

    if (callbacks.signal?.aborted) throw new Error('Generation cancelled by client');

    // ── Task 5.3: Plan Review Stage ───────────────────────────────────────────
    if (architecturePlan.files.length > COMPLEXITY_GATE_FILE_THRESHOLD) {
      callbacks.onStageStart?.('review', 'Reviewing architecture plan…');
      const reviewStageStartMs = Date.now();
      contextLogger.debug('Plan Review stage start');

      let _reviewRawContent: string | undefined;
      try {
        const planReviewPrompt = this.promptProvider.getPlanReviewPrompt(architecturePlan);

        const response = await this.reviewProvider.generate({
          prompt: 'Review the architecture plan',
          systemInstruction: planReviewPrompt,
          maxOutputTokens: this.promptProvider.tokenBudgets.planReview,
          responseSchema: PLAN_REVIEW_JSON_SCHEMA,
          signal: callbacks.signal,
        });

        _reviewRawContent = response.content ?? undefined;

        if (!response.success || !response.content) {
          throw new Error(response.error ?? 'Plan review stage AI call failed');
        }

        const parsedResult = parseStructuredOutput(response.content, PlanReviewSchema, 'PlanReview');
        if (!parsedResult.success) {
          const parseError = getStructuredParseError(parsedResult);
          throw new Error(parseError);
        }

        const reviewOutput = parsedResult.data;

        if (!reviewOutput.valid || reviewOutput.issues.length > 0) {
          contextLogger.warn('Plan Review found issues', {
            issues: reviewOutput.issues.length,
            durationMs: Date.now() - reviewStageStartMs,
          });
          architecturePlan = this.applyPlanCorrections(architecturePlan, reviewOutput);
        } else {
          contextLogger.info('Plan Review found no issues', { durationMs: Date.now() - reviewStageStartMs });
        }
        callbacks.onStageComplete?.('review');

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        contextLogger.warn('Plan review stage failed, proceeding with original plan', {
          error: message,
          stack: err instanceof Error ? err.stack : undefined,
          responsePreview: _reviewRawContent ? _reviewRawContent.substring(0, 400) : undefined,
        });
        callbacks.onStageFailed?.('review', message);
      }
    } else {
      contextLogger.info('Skipping plan review for simple project', {
        fileCount: architecturePlan.files.length,
        threshold: COMPLEXITY_GATE_FILE_THRESHOLD,
      });
      callbacks.onStageStart?.('review', 'Skipping plan review…');
      callbacks.onStageComplete?.('review');
    }

    if (callbacks.signal?.aborted) throw new Error('Generation cancelled by client');

    // ── Task 5.4: Complexity Gate ─────────────────────────────────────────────
    const isMultiPhase = this.shouldUseMultiPhase(architecturePlan);
    const complexityRoute = isMultiPhase ? 'multi-phase' : 'one-shot';
    
    contextLogger.info(`Complexity Gate routing`, { route: complexityRoute });

    // ── Task 5.6: Multi-Phase Execution Loop ──────────────────────────────────
    let allGeneratedFiles: GeneratedFile[] = [];
    const allWarnings: string[] = [];

    if (complexityRoute === 'multi-phase') {
      // ── Task 5.5: Phase Merge Logic ─────────────────────────────────────────
      const mergedPhases = this.mergePhases(architecturePlan);
      contextLogger.info('Phases after merge', {
        phases: mergedPhases.map(p => ({ layer: p.layer, fileCount: p.files.length }))
      });

      const result = await this.executeMultiPhase(
        mergedPhases,
        architecturePlan,
        userPrompt,
        recipe,
        callbacks,
        contextLogger
      );
      allGeneratedFiles = result.files;
      allWarnings.push(...result.warnings);
    } else {
      const result = await this.executeOneShot(
        architecturePlan,
        userPrompt,
        recipe,
        callbacks,
        contextLogger
      );
      allGeneratedFiles = result.files;
      allWarnings.push(...result.warnings);
    }

    contextLogger.info('[GEN-PIPELINE] complete', {
      durationMs: Date.now() - pipelineStartMs,
      complexityRoute,
      fileCount: allGeneratedFiles.length,
      filePaths: allGeneratedFiles.map(f => f.path),
      warningCount: allWarnings.length,
      intentComplexity: intentOutput?.complexity ?? 'unknown',
    });

    return {
      intentOutput,
      architecturePlan,
      complexityRoute,
      generatedFiles: allGeneratedFiles,
      warnings: allWarnings,
    };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Applies auto-corrections supplied by the AI Plan Reviewer.
   */
  private applyPlanCorrections(plan: ArchitecturePlan, review: PlanReviewOutput): ArchitecturePlan {
    const newPlan = { ...plan };
    let files = [...newPlan.files];

    if (review.corrections.filesToRemove.length > 0) {
      files = files.filter(f => !review.corrections.filesToRemove.includes(f.path));
    }

    if (review.corrections.importsToFix.length > 0) {
      files = files.map(file => {
        const fixes = review.corrections.importsToFix.filter(i => i.file === file.path);
        if (fixes.length === 0) return file;
        let updatedImports = [...(file.imports || [])];
        for (const fix of fixes) {
          updatedImports = updatedImports.map(i => i === fix.removeImport ? fix.addImport : i);
        }
        return { ...file, imports: updatedImports };
      });
    }

    if (review.corrections.filesToAdd.length > 0) {
      // Validate added files through the same schema used for planned files
      for (const file of review.corrections.filesToAdd) {
        const result = PlannedFileSchema.safeParse(file);
        if (result.success) {
          files.push(result.data);
        } else {
          logger.warn('Rejected invalid filesToAdd from plan review', {
            file: file.path,
            errors: result.error.issues.map(i => i.message),
          });
        }
      }
    }

    newPlan.files = files;
    return newPlan;
  }

  /**
   * Task 5.5: Phase merge logic.
   * Consolidates sparse layers into larger phases to reduce AI call overhead.
   *
   * Rules:
   * - If logic layer has <=1 file, merge those files into the UI phase.
   * - If integration layer has <=1 file, merge those files into the UI phase.
   * - Scaffold is never merged (it always runs first).
   */
  private mergePhases(plan: ArchitecturePlan): MergedPhase[] {
    const layerOrder: PhaseLayer[] = ['scaffold', 'logic', 'ui', 'integration'];
    const filesByLayer = new Map<PhaseLayer, PlannedFile[]>();

    for (const layer of layerOrder) {
      filesByLayer.set(layer, plan.files.filter(f => f.layer === layer));
    }

    const phases: MergedPhase[] = [];

    // Scaffold is always its own phase
    const scaffoldFiles = filesByLayer.get('scaffold') || [];
    if (scaffoldFiles.length > 0) {
      phases.push({ layer: 'scaffold', files: scaffoldFiles });
    }

    // Collect UI files first
    const uiFiles = [...(filesByLayer.get('ui') || [])];

    // Merge logic into UI if <=1 file
    const logicFiles = filesByLayer.get('logic') || [];
    if (logicFiles.length <= 1) {
      uiFiles.push(...logicFiles);
    } else {
      phases.push({ layer: 'logic', files: logicFiles });
    }

    // Merge integration into UI if <=1 file
    const integrationFiles = filesByLayer.get('integration') || [];
    if (integrationFiles.length <= 1) {
      uiFiles.push(...integrationFiles);
    } else {
      phases.push({ layer: 'integration', files: integrationFiles });
    }

    // UI phase (potentially with merged files)
    if (uiFiles.length > 0) {
      phases.push({ layer: 'ui', files: uiFiles });
    }

    // Sort into canonical order: scaffold -> logic -> ui -> integration
    phases.sort((a, b) => layerOrder.indexOf(a.layer) - layerOrder.indexOf(b.layer));

    return phases;
  }

  /**
   * Task 5.6: Multi-phase execution loop.
   * Executes each phase via PhaseExecutor, building inter-phase context and
   * splitting large UI phases into sub-batches.
   */
  private async executeMultiPhase(
    mergedPhases: MergedPhase[],
    plan: ArchitecturePlan,
    userPrompt: string,
    recipe: any,
    callbacks: PipelineCallbacks,
    contextLogger: any
  ): Promise<{ files: GeneratedFile[]; warnings: string[] }> {
    const allFiles: GeneratedFile[] = [];
    const allWarnings: string[] = [];
    // Accumulated map of path -> content for inter-phase context
    const generatedFilesMap = new Map<string, string>();
    // Shared summary cache — avoids re-summarizing scaffold files on every phase
    const summaryCache = new Map<string, import('./batch-context-builder').FileSummary>();
    const totalPlanned = mergedPhases.reduce((sum, p) => sum + p.files.length, 0);

    for (let phaseIndex = 0; phaseIndex < mergedPhases.length; phaseIndex++) {
      const phase = mergedPhases[phaseIndex];
      if (callbacks.signal?.aborted) throw new Error('Generation cancelled by client');

      callbacks.onStageStart?.(phase.layer, `Generating ${phase.layer} layer…`);
      callbacks.onPhaseStart?.({
        phase: phase.layer,
        phaseIndex,
        totalPhases: mergedPhases.length,
        filesInPhase: phase.files.length,
      });
      contextLogger.info(`Starting phase execution`, { layer: phase.layer, fileCount: phase.files.length });

      // Split UI phase into sub-batches if needed
      const batches: PlannedFile[][] = [];
      if (phase.layer === 'ui' && phase.files.length > UI_BATCH_SPLIT_THRESHOLD) {
        for (let i = 0; i < phase.files.length; i += UI_BATCH_SPLIT_THRESHOLD) {
          batches.push(phase.files.slice(i, i + UI_BATCH_SPLIT_THRESHOLD));
        }
        contextLogger.info(`UI phase split into ${batches.length} sub-batches`);
      } else {
        batches.push(phase.files);
      }

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batchFiles = batches[batchIndex];

        // Build inter-phase context from previously generated files
        const context = buildPhaseContext(
          phase.layer,
          plan,
          generatedFilesMap,
          batchFiles,
          summaryCache
        );

        const phaseDef: PhaseDefinition = {
          layer: phase.layer,
          plan,
          userPrompt,
          recipe,
          expectedFiles: batchFiles.map((file) => file.path),
        };

        const phaseCallbacks: PhaseCallbacks = {
          onProgress: callbacks.onProgress,
          onFileStream: callbacks.onFileStream,
          onWarning: (warning) => allWarnings.push(warning),
          signal: callbacks.signal,
        };

        try {
          const result = await this.phaseExecutor.executePhase(
            phaseDef,
            context,
            phaseCallbacks
          );

          // Accumulate results
          for (const file of result.files) {
            allFiles.push(file);
            generatedFilesMap.set(file.path, file.content);
            // Invalidate stale cache entry if this file was regenerated in a later phase
            summaryCache.delete(file.path);
          }
          allWarnings.push(...result.warnings);

          contextLogger.info(`Phase batch complete`, {
            layer: phase.layer,
            batch: `${batchIndex + 1}/${batches.length}`,
            filesGenerated: result.files.length,
            warnings: result.warnings.length,
          });

          // Hard-fail if a non-scaffold phase generated 0 out of N expected files.
          // A project missing its entire UI or integration layer is worse than a
          // clear error the user can retry.
          if (result.files.length === 0 && batchFiles.length > 0) {
            const msg = `Phase ${phase.layer} generated 0/${batchFiles.length} expected files`;
            contextLogger.error(msg, { expectedFiles: batchFiles.map(f => f.path) });
            throw new Error(msg);
          }

          if (result.files.length !== batchFiles.length) {
            const generatedPaths = new Set(result.files.map((file) => file.path));
            const missingPaths = batchFiles
              .map((file) => file.path)
              .filter((path) => !generatedPaths.has(path));
            const msg = `Phase ${phase.layer} generated ${result.files.length}/${batchFiles.length} expected files`;
            contextLogger.error(msg, { expectedFiles: batchFiles.map(f => f.path), missingPaths });
            throw new Error(`${msg}. Missing: ${missingPaths.join(', ')}`);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          contextLogger.error(`Phase execution failed`, { layer: phase.layer, error: message });

          // Client cancellation should propagate immediately
          if (callbacks.signal?.aborted) {
            throw err;
          }

          callbacks.onStageFailed?.(phase.layer, message);
          throw err;
        }
      }

      callbacks.onStageComplete?.(phase.layer);
      callbacks.onPhaseComplete?.({
        phase: phase.layer,
        phaseIndex,
        filesGenerated: allFiles.filter(f => phase.files.some(pf => pf.path === f.path)).length,
        totalGenerated: allFiles.length,
        totalPlanned,
      });
    }

    return { files: allFiles, warnings: allWarnings };
  }

  /**
   * True one-shot execution path for simple projects (≤10 files).
   * Issues a single AI call with the full-app generation prompt instead of
   * running scaffold + UI as two sequential calls.
   */
  private async executeOneShot(
    plan: ArchitecturePlan,
    userPrompt: string,
    recipe: any,
    callbacks: PipelineCallbacks,
    contextLogger: any
  ): Promise<{ files: GeneratedFile[]; warnings: string[] }> {
    callbacks.onStageStart?.('oneshot', 'Generating application…');
    callbacks.onPhaseStart?.({
      phase: 'oneshot',
      phaseIndex: 0,
      totalPhases: 1,
      filesInPhase: plan.files.length,
    });
    contextLogger.info('Starting one-shot execution', { fileCount: plan.files.length });

    const emptyContext: PhaseContext = {
      typeDefinitions: new Map(),
      directDependencies: new Map(),
      fileSummaries: [],
      cssVariables: [],
      relevantContracts: { typeContracts: [], stateShape: { contexts: [], hooks: [] } },
      missingPlannedImports: [],
    };

    const phaseDef: PhaseDefinition = {
      layer: 'oneshot',
      plan,
      userPrompt,
      recipe,
      expectedFiles: plan.files.map((f) => f.path),
    };

    const allWarnings: string[] = [];
    const phaseCallbacks: PhaseCallbacks = {
      onProgress: callbacks.onProgress,
      onFileStream: callbacks.onFileStream,
      onWarning: (warning) => allWarnings.push(warning),
      signal: callbacks.signal,
    };

    const result = await this.phaseExecutor.executePhase(phaseDef, emptyContext, phaseCallbacks);
    allWarnings.push(...result.warnings);

    callbacks.onStageComplete?.('oneshot');
    callbacks.onPhaseComplete?.({
      phase: 'oneshot',
      phaseIndex: 0,
      filesGenerated: result.files.length,
      totalGenerated: result.files.length,
      totalPlanned: plan.files.length,
    });

    return { files: result.files, warnings: allWarnings };
  }

  /**
   * Complexity gate determining if the application should be built one-shot or multi-phase.
   */
  private shouldUseMultiPhase(plan: ArchitecturePlan): boolean {
    if (plan.files.length > COMPLEXITY_GATE_FILE_THRESHOLD) {
      return true;
    }
    const estimatedInputTokens = this.estimateOneShotInputTokens(plan);
    // 80k tokens ≈ 80% of a 100k context window
    const TOKEN_THRESHOLD = 80_000;
    return estimatedInputTokens > TOKEN_THRESHOLD;
  }

  /**
   * Roughly estimates the input tokens required for single-shot generation.
   */
  private estimateOneShotInputTokens(plan: ArchitecturePlan): number {
    const SYSTEM_PROMPT_BASELINE_TOKENS = 4000;
    const stringifiedPlan = JSON.stringify(plan, null, 2);
    return SYSTEM_PROMPT_BASELINE_TOKENS + Math.floor(stringifiedPlan.length / 4);
  }

  private async resolveArchitecturePlan(
    userPrompt: string,
    intentOutput: IntentOutput | null,
    initialPlanningPromise: Promise<{ success: boolean; content?: string | null; error?: string | null }>,
    callbacks: PipelineCallbacks,
    contextLogger: typeof logger,
    planningStageStartMs: number
  ): Promise<ArchitecturePlan> {
    let lastError: unknown;
    let lastRawContent: string | undefined;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = attempt === 1
          ? await initialPlanningPromise
          : await this.planningProvider.generate({
              prompt: userPrompt,
              systemInstruction:
                `${this.promptProvider.getArchitecturePlanningPrompt(userPrompt, intentOutput)}\n\n` +
                'RETRY REQUIREMENT: Return a single valid ArchitecturePlan JSON object only. ' +
                'Do not omit required arrays. Do not add prose or markdown fences.',
              maxOutputTokens: this.promptProvider.tokenBudgets.architecturePlanning,
              responseSchema: ARCHITECTURE_PLAN_JSON_SCHEMA,
              signal: callbacks.signal,
            });

        lastRawContent = response.content ?? undefined;

        if (!response.success || !response.content) {
          throw new Error(response.error ?? 'Planning stage AI call failed');
        }

        const parsedResult = parseStructuredOutput(response.content, ArchitecturePlanSchema, 'ArchitecturePlan');
        if (!parsedResult.success) {
          const parseError = getStructuredParseError(parsedResult);
          throw new Error(parseError);
        }

        contextLogger.info('Enhanced Planning stage complete', {
          attempt,
          fileCount: parsedResult.data.files.length,
          layers: [...new Set(parsedResult.data.files.map(f => f.layer))],
          filePaths: parsedResult.data.files.map(f => f.path),
          dependencies: parsedResult.data.dependencies,
          durationMs: Date.now() - planningStageStartMs,
        });
        callbacks.onStageComplete?.('planning');
        return parsedResult.data;
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : String(err);
        contextLogger.warn('Planning stage attempt failed', {
          attempt,
          error: message,
          stack: err instanceof Error ? err.stack : undefined,
          responsePreview: lastRawContent ? lastRawContent.substring(0, 800) : undefined,
          intentComplexity: intentOutput?.complexity,
        });
      }
    }

    const finalMessage = lastError instanceof Error ? lastError.message : String(lastError);
    callbacks.onStageFailed?.('planning', finalMessage);
    throw new Error(`Planning stage failed after retry: ${finalMessage}`);
  }
}
