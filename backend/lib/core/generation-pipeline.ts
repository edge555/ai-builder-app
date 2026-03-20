/**
 * @module core/generation-pipeline
 * @description The main orchestrator that replaces the legacy Generation path.
 * It manages Intent, Planning, Multi-Phase Execution, Review, and BugFix.
 */

import type { AIProvider } from '../ai/ai-provider';
import type { IPromptProvider, ArchitecturePlan } from './prompts/prompt-provider';
import type { IntentOutput, PlanReviewOutput, PlannedFile, GeneratedFile, PhaseLayer } from './schemas';
import { IntentOutputSchema, ArchitecturePlanSchema, PlanReviewSchema } from './schemas';
import { toSimpleJsonSchema } from './zod-to-json-schema';
import { createLogger } from '../logger';
import { selectRecipe } from './recipes/recipe-engine';
import { config } from '../config';
import { buildHeuristicPlan } from './heuristic-plan-builder';
import { PhaseExecutor, type PhaseDefinition, type PhaseCallbacks } from './phase-executor';
import { BuildValidator } from './build-validator';
import { buildPhaseContext } from './batch-context-builder';

const logger = createLogger('GenerationPipeline');

const INTENT_JSON_SCHEMA = toSimpleJsonSchema(IntentOutputSchema);
const ARCHITECTURE_PLAN_JSON_SCHEMA = toSimpleJsonSchema(ArchitecturePlanSchema);
const PLAN_REVIEW_JSON_SCHEMA = toSimpleJsonSchema(PlanReviewSchema);

export interface PipelineCallbacks {
  onStageStart?: (stage: string, label: string) => void;
  onStageComplete?: (stage: string) => void;
  onStageFailed?: (stage: string, error: string) => void;
  onProgress?: (accumulatedLength: number) => void;
  onFileStream?: (file: GeneratedFile, isComplete: boolean) => void;
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
    private readonly bugfixProvider: AIProvider,
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

    // ── Task 5.1: Intent Stage ────────────────────────────────────────────────
    callbacks.onStageStart?.('intent', 'Analyzing your request…');
    contextLogger.debug('Intent stage start');

    let intentOutput: IntentOutput | null = null;
    try {
      const response = await this.intentProvider.generate({
        prompt: userPrompt,
        systemInstruction: this.promptProvider.getIntentSystemPrompt(),
        maxOutputTokens: this.promptProvider.tokenBudgets.intent,
        responseSchema: INTENT_JSON_SCHEMA,
        signal: callbacks.signal,
      });

      if (!response.success || !response.content) {
        throw new Error(response.error ?? 'Intent stage returned empty content');
      }

      const parsed = JSON.parse(response.content);
      const zodResult = IntentOutputSchema.safeParse(parsed);

      if (!zodResult.success) {
        throw new Error(`Intent schema mismatch: ${zodResult.error.message}`);
      }

      intentOutput = zodResult.data;
      contextLogger.info('Intent stage complete', { complexity: intentOutput.complexity });
      callbacks.onStageComplete?.('intent');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      contextLogger.warn('Intent stage failed (degraded)', { error: message });
      callbacks.onStageFailed?.('intent', message);
    }

    if (callbacks.signal?.aborted) throw new Error('Generation cancelled by client');

    // ── Recipe Selection ──────────────────────────────────────────────────────
    const recipe = selectRecipe(intentOutput, {
      fullstackEnabled: config.recipes.fullstackEnabled,
    });
    contextLogger.info('Recipe selected', { recipeId: recipe.id });
    
    // Attempt to inject recipe into prompt provider if supported
    if (typeof (this.promptProvider as any).setRecipe === 'function') {
      (this.promptProvider as any).setRecipe(recipe);
    }

    // ── Task 5.2: Enhanced Planning Stage ─────────────────────────────────────
    callbacks.onStageStart?.('planning', 'Drafting architecture plan…');
    contextLogger.debug('Enhanced Planning stage start');

    let architecturePlan: ArchitecturePlan | null = null;
    try {
      const planSystemPrompt = this.promptProvider.getArchitecturePlanningPrompt(userPrompt, intentOutput);
      
      const response = await this.planningProvider.generate({
        prompt: userPrompt,
        systemInstruction: planSystemPrompt,
        maxOutputTokens: this.promptProvider.tokenBudgets.architecturePlanning,
        responseSchema: ARCHITECTURE_PLAN_JSON_SCHEMA,
        signal: callbacks.signal,
      });

      if (!response.success || !response.content) {
        throw new Error(response.error ?? 'Planning stage AI call failed');
      }

      const parsed = JSON.parse(response.content);
      const zodResult = ArchitecturePlanSchema.safeParse(parsed);

      if (!zodResult.success) {
        throw new Error(`ArchitecturePlan schema mismatch: ${zodResult.error.message}`);
      }

      architecturePlan = zodResult.data;
      contextLogger.info('Enhanced Planning stage complete', {
        fileCount: architecturePlan.files.length,
        layers: [...new Set(architecturePlan.files.map(f => f.layer))],
      });
      callbacks.onStageComplete?.('planning');
      
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      contextLogger.warn('Planning stage failed. Falling back to heuristic plan.', { error: message });
      callbacks.onStageFailed?.('planning', `Using heuristic fallback: ${message}`);
      
      // Fallback
      architecturePlan = buildHeuristicPlan(intentOutput, userPrompt);
    }

    if (callbacks.signal?.aborted) throw new Error('Generation cancelled by client');

    // ── Task 5.3: Plan Review Stage ───────────────────────────────────────────
    callbacks.onStageStart?.('review', 'Reviewing architecture plan…');
    contextLogger.debug('Plan Review stage start');

    try {
      const planReviewPrompt = this.promptProvider.getPlanReviewPrompt(architecturePlan);
      
      const response = await this.reviewProvider.generate({
        prompt: 'Review the architecture plan',
        systemInstruction: planReviewPrompt,
        maxOutputTokens: this.promptProvider.tokenBudgets.planReview,
        responseSchema: PLAN_REVIEW_JSON_SCHEMA,
        signal: callbacks.signal,
      });

      if (!response.success || !response.content) {
        throw new Error(response.error ?? 'Plan review stage AI call failed');
      }

      const parsed = JSON.parse(response.content);
      const zodResult = PlanReviewSchema.safeParse(parsed);

      if (!zodResult.success) {
        throw new Error(`PlanReview schema mismatch: ${zodResult.error.message}`);
      }

      const reviewOutput = zodResult.data;
      
      if (!reviewOutput.valid || reviewOutput.issues.length > 0) {
        contextLogger.warn('Plan Review found issues', { issues: reviewOutput.issues.length });
        architecturePlan = this.applyPlanCorrections(architecturePlan, reviewOutput);
      } else {
        contextLogger.info('Plan Review found no issues');
      }
      callbacks.onStageComplete?.('review');

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      contextLogger.warn('Plan review stage failed, proceeding with original plan', { error: message });
      callbacks.onStageFailed?.('review', message);
    }

    if (callbacks.signal?.aborted) throw new Error('Generation cancelled by client');

    // ── Task 5.4: Complexity Gate ─────────────────────────────────────────────
    const isMultiPhase = this.shouldUseMultiPhase(architecturePlan);
    const complexityRoute = isMultiPhase ? 'multi-phase' : 'one-shot';
    
    contextLogger.info(`Complexity Gate routing`, { route: complexityRoute });

    // ── Task 5.5: Phase Merge Logic ───────────────────────────────────────────
    const mergedPhases = this.mergePhases(architecturePlan);
    contextLogger.info('Phases after merge', { 
      phases: mergedPhases.map(p => ({ layer: p.layer, fileCount: p.files.length })) 
    });

    // ── Task 5.6: Multi-Phase Execution Loop ──────────────────────────────────
    let allGeneratedFiles: GeneratedFile[] = [];
    const allWarnings: string[] = [];

    if (complexityRoute === 'multi-phase') {
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
      // One-shot: run all phases in a single merged pass
      // For now, execute them sequentially but skip inter-phase context
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
    }

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
      files.push(...review.corrections.filesToAdd);
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

    const UI_SUB_BATCH_SIZE = 12;

    for (const phase of mergedPhases) {
      if (callbacks.signal?.aborted) throw new Error('Generation cancelled by client');

      callbacks.onStageStart?.(phase.layer, `Generating ${phase.layer} layer…`);
      contextLogger.info(`Starting phase execution`, { layer: phase.layer, fileCount: phase.files.length });

      // Split UI phase into sub-batches if needed
      const batches: PlannedFile[][] = [];
      if (phase.layer === 'ui' && phase.files.length > UI_SUB_BATCH_SIZE) {
        for (let i = 0; i < phase.files.length; i += UI_SUB_BATCH_SIZE) {
          batches.push(phase.files.slice(i, i + UI_SUB_BATCH_SIZE));
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
          batchFiles
        );

        const phaseDef: PhaseDefinition = {
          layer: phase.layer,
          plan,
          userPrompt,
          recipe,
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
          }
          allWarnings.push(...result.warnings);

          contextLogger.info(`Phase batch complete`, {
            layer: phase.layer,
            batch: `${batchIndex + 1}/${batches.length}`,
            filesGenerated: result.files.length,
            warnings: result.warnings.length,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          contextLogger.error(`Phase execution failed`, { layer: phase.layer, error: message });

          // Scaffold failure is fatal
          if (phase.layer === 'scaffold') {
            throw err;
          }

          // Other phases: record warning, continue
          allWarnings.push(`Phase ${phase.layer} failed: ${message}`);
          callbacks.onStageFailed?.(phase.layer, message);
        }
      }

      callbacks.onStageComplete?.(phase.layer);
    }

    return { files: allFiles, warnings: allWarnings };
  }

  /**
   * Complexity gate determining if the application should be built one-shot or multi-phase.
   */
  private shouldUseMultiPhase(plan: ArchitecturePlan): boolean {
    if (plan.files.length > 10) {
      return true;
    }
    const estimatedInputTokens = this.estimateOneShotInputTokens(plan);
    const TOKEN_THRESHOLD = 80000;
    return estimatedInputTokens > TOKEN_THRESHOLD;
  }

  /**
   * Roughly estimates the input tokens required for single-shot generation.
   */
  private estimateOneShotInputTokens(plan: ArchitecturePlan): number {
    const stringifiedPlan = JSON.stringify(plan, null, 2);
    return Math.floor(stringifiedPlan.length / 4);
  }
}
