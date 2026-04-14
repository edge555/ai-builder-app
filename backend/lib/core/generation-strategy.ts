/**
 * @module core/generation-strategy
 * @description GenerationStrategy — IPipelineStrategy implementation for new project generation.
 * Contains all logic from GenerationPipeline except the intent stage boilerplate
 * (which is now in pipeline-shared.ts).
 */

import type { AIProvider } from '../ai/ai-provider';
import type { IPromptProvider, ArchitecturePlan } from './prompts/prompt-provider';
import type { IntentOutput, PlanReviewOutput, PlannedFile, GeneratedFile, PhaseLayer } from './schemas';
import { ArchitecturePlanSchema, PlanReviewSchema, PlannedFileSchema } from './schemas';
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
import { buildHeuristicPlan } from './heuristic-plan-builder';
import type { GenerationRecipe } from './recipes/recipe-types';
import type { IPipelineStrategy } from './pipeline-strategy';
import type { UnifiedPipelineCallbacks } from './pipeline-shared';

const logger = createLogger('GenerationStrategy');

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

/** Describes a merged execution phase with its file list. */
export interface MergedPhase {
  layer: PhaseLayer;
  files: PlannedFile[];
}

export interface GenerationResult {
  intentOutput: IntentOutput | null;
  architecturePlan: ArchitecturePlan | null;
  selectedRecipeId: string | null;
  complexityRoute: 'one-shot' | 'multi-phase' | null;
  generatedFiles: GeneratedFile[];
  warnings: string[];
}

export interface GenerationStrategyOptions {
  requestId?: string;
  beginnerMode?: boolean;
}

export class GenerationStrategy implements IPipelineStrategy<ArchitecturePlan, GenerationResult> {
  private readonly phaseExecutor: PhaseExecutor;

  /** Exposed so that createStreamingProjectGenerator can access the bugfix provider. */
  readonly bugfixProvider: AIProvider;

  constructor(
    private readonly planningProvider: AIProvider,
    private readonly executionProvider: AIProvider,
    private readonly reviewProvider: AIProvider,
    bugfixProvider: AIProvider,
    private readonly promptProvider: IPromptProvider,
    buildValidator?: BuildValidator
  ) {
    this.bugfixProvider = bugfixProvider;
    this.phaseExecutor = new PhaseExecutor(
      this.executionProvider,
      this.promptProvider,
      buildValidator ?? new BuildValidator()
    );
  }

  planningLabel(_intentOutput: unknown): string {
    return 'Drafting architecture plan…';
  }

  canSkipPlanning(): boolean {
    return false;
  }

  async runPlanning(
    userPrompt: string,
    intentOutput: unknown,
    callbacks: UnifiedPipelineCallbacks,
    options?: Record<string, unknown>,
  ): Promise<ArchitecturePlan> {
    const typedIntentOutput = intentOutput as IntentOutput | null;
    const beginnerMode = options?.['beginnerMode'] as boolean | undefined;
    const requestId = options?.['requestId'] as string | undefined;
    const contextLogger = requestId ? logger.withRequestId(requestId) : logger;
    const planningStageStartMs = Date.now();

    callbacks.onStageStart?.('planning', 'Drafting architecture plan…');
    contextLogger.debug('Enhanced Planning stage start');

    // Fire the planning AI call before recipe selection to minimise latency.
    const planningPromise = beginnerMode
      ? null
      : this.planningProvider.generate({
          prompt: userPrompt,
          systemInstruction: this.promptProvider.getArchitecturePlanningPrompt(userPrompt, typedIntentOutput),
          maxOutputTokens: this.promptProvider.tokenBudgets.architecturePlanning,
          responseSchema: ARCHITECTURE_PLAN_JSON_SCHEMA,
          signal: callbacks.signal,
        });

    // Recipe selection (runs while planning is in flight — synchronous, <1ms)
    const recipe = selectRecipe(typedIntentOutput, {
      fullstackEnabled: config.recipes.fullstackEnabled,
      beginnerMode,
    }, userPrompt);
    contextLogger.info('Recipe selected', { recipeId: recipe.id });
    this.promptProvider.setRecipe?.(recipe);

    // Await planning result
    let architecturePlan: ArchitecturePlan;
    if (beginnerMode) {
      architecturePlan = buildHeuristicPlan(typedIntentOutput, userPrompt, recipe);
      callbacks.onStageComplete?.('planning');
    } else {
      architecturePlan = await this.resolveArchitecturePlan(
        userPrompt,
        typedIntentOutput,
        planningPromise!,
        callbacks,
        contextLogger,
        planningStageStartMs,
        recipe
      );
    }

    return architecturePlan;
  }

  async runExecution(
    userPrompt: string,
    intentOutput: unknown,
    planContext: ArchitecturePlan | null,
    callbacks: UnifiedPipelineCallbacks,
    options?: Record<string, unknown>,
  ): Promise<GenerationResult> {
    const typedIntentOutput = intentOutput as IntentOutput | null;
    const requestId = options?.['requestId'] as string | undefined;
    const contextLogger = requestId ? logger.withRequestId(requestId) : logger;

    // planContext should always be present for generation; but guard defensively
    const architecturePlan = planContext!;

    // ── Plan Review Stage ─────────────────────────────────────────────────────
    let reviewedPlan = architecturePlan;
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
          reviewedPlan = this.applyPlanCorrections(architecturePlan, reviewOutput);
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

    // ── Complexity Gate ───────────────────────────────────────────────────────
    const isMultiPhase = this.shouldUseMultiPhase(reviewedPlan);
    const complexityRoute = isMultiPhase ? 'multi-phase' : 'one-shot';
    contextLogger.info('Complexity Gate routing', { route: complexityRoute });

    let allGeneratedFiles: GeneratedFile[] = [];
    const allWarnings: string[] = [];

    // Need to retrieve recipe from planning options — it was stored via setRecipe on the promptProvider.
    // We rebuild the recipe reference by re-selecting (same deterministic logic, <1ms).
    const recipe = selectRecipe(typedIntentOutput, {
      fullstackEnabled: config.recipes.fullstackEnabled,
    }, userPrompt);

    if (complexityRoute === 'multi-phase') {
      const mergedPhases = this.mergePhases(reviewedPlan);
      contextLogger.info('Phases after merge', {
        phases: mergedPhases.map(p => ({ layer: p.layer, fileCount: p.files.length }))
      });

      const result = await this.executeMultiPhase(
        mergedPhases,
        reviewedPlan,
        userPrompt,
        recipe,
        callbacks,
        contextLogger
      );
      allGeneratedFiles = result.files;
      allWarnings.push(...result.warnings);
    } else {
      const result = await this.executeOneShot(
        reviewedPlan,
        userPrompt,
        recipe,
        callbacks,
        contextLogger
      );
      allGeneratedFiles = result.files;
      allWarnings.push(...result.warnings);
    }

    return {
      intentOutput: typedIntentOutput,
      architecturePlan: reviewedPlan,
      selectedRecipeId: recipe.id,
      complexityRoute,
      generatedFiles: allGeneratedFiles,
      warnings: allWarnings,
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

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

  private mergePhases(plan: ArchitecturePlan): MergedPhase[] {
    const layerOrder: PhaseLayer[] = ['scaffold', 'logic', 'ui', 'integration'];
    const filesByLayer = new Map<PhaseLayer, PlannedFile[]>();

    for (const layer of layerOrder) {
      filesByLayer.set(layer, plan.files.filter(f => f.layer === layer));
    }

    const phases: MergedPhase[] = [];

    const scaffoldFiles = filesByLayer.get('scaffold') || [];
    if (scaffoldFiles.length > 0) {
      phases.push({ layer: 'scaffold', files: scaffoldFiles });
    }

    const uiFiles = [...(filesByLayer.get('ui') || [])];

    const logicFiles = filesByLayer.get('logic') || [];
    if (logicFiles.length <= 1) {
      uiFiles.push(...logicFiles);
    } else {
      phases.push({ layer: 'logic', files: logicFiles });
    }

    const integrationFiles = filesByLayer.get('integration') || [];
    if (integrationFiles.length <= 1) {
      uiFiles.push(...integrationFiles);
    } else {
      phases.push({ layer: 'integration', files: integrationFiles });
    }

    if (uiFiles.length > 0) {
      phases.push({ layer: 'ui', files: uiFiles });
    }

    phases.sort((a, b) => layerOrder.indexOf(a.layer) - layerOrder.indexOf(b.layer));

    return phases;
  }

  private async executeMultiPhase(
    mergedPhases: MergedPhase[],
    plan: ArchitecturePlan,
    userPrompt: string,
    recipe: GenerationRecipe,
    callbacks: UnifiedPipelineCallbacks,
    contextLogger: ReturnType<typeof logger.withRequestId>
  ): Promise<{ files: GeneratedFile[]; warnings: string[] }> {
    const allFiles: GeneratedFile[] = [];
    const allWarnings: string[] = [];
    const generatedFilesMap = new Map<string, string>();
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
      contextLogger.info('Starting phase execution', { layer: phase.layer, fileCount: phase.files.length });

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
          const result = await this.phaseExecutor.executePhase(phaseDef, context, phaseCallbacks);

          for (const file of result.files) {
            allFiles.push(file);
            generatedFilesMap.set(file.path, file.content);
            summaryCache.delete(file.path);
          }
          allWarnings.push(...result.warnings);

          contextLogger.info('Phase batch complete', {
            layer: phase.layer,
            batch: `${batchIndex + 1}/${batches.length}`,
            filesGenerated: result.files.length,
            warnings: result.warnings.length,
          });

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
          contextLogger.error('Phase execution failed', { layer: phase.layer, error: message });

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

  private async executeOneShot(
    plan: ArchitecturePlan,
    userPrompt: string,
    recipe: GenerationRecipe,
    callbacks: UnifiedPipelineCallbacks,
    contextLogger: ReturnType<typeof logger.withRequestId>
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

  private shouldUseMultiPhase(plan: ArchitecturePlan): boolean {
    if (plan.files.length > COMPLEXITY_GATE_FILE_THRESHOLD) {
      return true;
    }
    const estimatedInputTokens = this.estimateOneShotInputTokens(plan);
    const TOKEN_THRESHOLD = 80_000;
    return estimatedInputTokens > TOKEN_THRESHOLD;
  }

  private estimateOneShotInputTokens(plan: ArchitecturePlan): number {
    const SYSTEM_PROMPT_BASELINE_TOKENS = 4000;
    const stringifiedPlan = JSON.stringify(plan, null, 2);
    return SYSTEM_PROMPT_BASELINE_TOKENS + Math.floor(stringifiedPlan.length / 4);
  }

  private async resolveArchitecturePlan(
    userPrompt: string,
    intentOutput: IntentOutput | null,
    initialPlanningPromise: Promise<{ success: boolean; content?: string | null; error?: string | null }>,
    callbacks: UnifiedPipelineCallbacks,
    contextLogger: ReturnType<typeof logger.withRequestId>,
    planningStageStartMs: number,
    selectedRecipe: GenerationRecipe
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
    contextLogger.warn('Planning stage failed after retry, falling back to heuristic plan', {
      error: finalMessage,
      recipeId: selectedRecipe.id,
    });
    return buildHeuristicPlan(intentOutput, userPrompt, selectedRecipe);
  }
}
