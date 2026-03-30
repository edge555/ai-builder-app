/**
 * @module core/pipeline-orchestrator
 * @description Modification AI pipeline: Intent → Planning → Execution → Review.
 *
 * Graceful degradation model:
 * - Intent, Planning, Review: non-fatal — null output on failure, pipeline continues
 * - Execution: hard-fail — throws so the route handler can return 500
 *
 * PipelineOrchestrator is now strictly for Modification. For Generation, use the
 * new GenerationPipeline from `generation-pipeline.ts`. Create instances via
 * `pipeline-factory.ts`.
 *
 * @requires ../ai/ai-provider - AIProvider interface
 * @requires ./prompts/prompt-provider - IPromptProvider interface
 * @requires ./schemas - Zod schemas + inferred types
 * @requires ./zod-to-json-schema - Converts Zod schemas to LLM-compatible JSON schema
 * @requires ../logger - Structured logging
 */

import type { AIProvider } from '../ai/ai-provider';
import type { IPromptProvider } from './prompts/prompt-provider';
import type { IntentOutput, PlanOutput } from './schemas';
import { IntentOutputSchema, PlanOutputSchema } from './schemas';
import { toSimpleJsonSchema } from './zod-to-json-schema';
import { createLogger } from '../logger';
import type { CodeSlice } from '../analysis/file-planner/types';
import { getFileOutline } from '../analysis/slice-selector';
import { addLineNumbers } from '../diff/prompt-builder';
import { buildProjectMap } from '../analysis/project-map';
import { MAX_CONTEXT_SLICES_MODIFICATION } from '../constants';
import { selectRecipe } from './recipes/recipe-engine';
import { extractJsonFromResponse } from '../ai/modal-response-parser';
import { config } from '../config';

const logger = createLogger('PipelineOrchestrator');

// JSON schemas passed to the AI as responseSchema (for structured output)

const INTENT_JSON_SCHEMA = toSimpleJsonSchema(IntentOutputSchema);
const PLAN_JSON_SCHEMA = toSimpleJsonSchema(PlanOutputSchema);

// ─── Public Types ─────────────────────────────────────────────────────────────

/** Stages emitted as SSE events. Bugfix is an internal loop — not a public stage. */
export type PipelineStage = 'intent' | 'planning' | 'execution';

export interface PipelineCallbacks {
  /** Fired when a stage begins. `label` is a human-readable status string. */
  onStageStart?: (stage: PipelineStage, label: string) => void;
  /** Fired when a stage completes successfully. */
  onStageComplete?: (stage: PipelineStage) => void;
  /** Fired when a non-fatal stage fails (degraded mode — pipeline continues). */
  onStageFailed?: (stage: PipelineStage, error: string) => void;
  /** Fired for each streaming chunk from the execution stage. */
  onExecutionChunk?: (chunk: string, accumulatedLength: number) => void;
  /** AbortSignal to cancel in-flight AI requests. */
  signal?: AbortSignal;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface PipelineResult {
  intentOutput: IntentOutput | null;
  planOutput: PlanOutput | null;
  /** Raw files returned by the execution stage. */
  executorFiles: GeneratedFile[];
  /** Final files — same as executorFiles after apply_modifications. */
  finalFiles: GeneratedFile[];
}

// ─── PipelineOrchestrator ────────────────────────────────────────────────────

export class PipelineOrchestrator {
  constructor(
    private readonly intentProvider: AIProvider,
    private readonly planningProvider: AIProvider,
    private readonly executionProvider: AIProvider,
    private readonly promptProvider: IPromptProvider
  ) {}



  // ─── Modification Pipeline ────────────────────────────────────────────────

  /**
   * Runs the full 4-stage pipeline for modifying an existing project.
   *
   * @param userPrompt - The user's modification request
   * @param currentFiles - Current project files (path → content)
   * @param fileSlices - Relevant code slices pre-selected by FilePlanner
   * @param callbacks - Stage lifecycle + streaming callbacks
   * @param options - Optional request metadata
   */
  async runModificationPipeline(
    userPrompt: string,
    currentFiles: Record<string, string>,
    fileSlices: CodeSlice[],
    callbacks: PipelineCallbacks,
    options?: { requestId?: string; designSystem?: boolean; skipIntent?: boolean; skipPlanning?: boolean }
  ): Promise<PipelineResult> {
    const contextLogger = options?.requestId
      ? logger.withRequestId(options.requestId)
      : logger;

    const pipelineStartMs = Date.now();
    contextLogger.info('[MOD-PIPELINE] start', {
      promptPreview: userPrompt.slice(0, 150),
      currentFileCount: Object.keys(currentFiles).length,
      sliceCount: fileSlices.length,
      primaryFiles: fileSlices.filter(s => s.relevance === 'primary').map(s => s.filePath),
      skipIntent: options?.skipIntent ?? false,
      skipPlanning: options?.skipPlanning ?? false,
    });

    // ── Stage 1: Intent ──────────────────────────────────────────────────────
    const intentOutput = options?.skipIntent
      ? null
      : await this.runIntentStage(userPrompt, callbacks, contextLogger);

    if (callbacks.signal?.aborted) throw new Error('Modification cancelled by client');

    // ── Stage 2: Planning ────────────────────────────────────────────────────
    const planOutput = options?.skipPlanning
      ? null
      : await this.runPlanningStage(userPrompt, intentOutput, callbacks, contextLogger);

    if (callbacks.signal?.aborted) throw new Error('Modification cancelled by client');

    // ── Stage 3: Execution (hard-fail) ───────────────────────────────────────
    const executorContent = await this.runExecutionModificationStage(
      userPrompt,
      intentOutput,
      planOutput,
      fileSlices,
      currentFiles,
      callbacks,
      contextLogger,
      options?.designSystem ?? false
    );

    const finalFiles = this.applyModificationsToFiles(currentFiles, executorContent);

    contextLogger.info('[MOD-PIPELINE] complete', {
      durationMs: Date.now() - pipelineStartMs,
      executorFileCount: executorContent.length,
      executorFilePaths: executorContent.filter(f => f.path !== '__pipeline_raw__').map(f => f.path),
      finalFileCount: finalFiles.length,
    });

    return { intentOutput, planOutput, executorFiles: executorContent, finalFiles };
  }

  // ─── Ordered Execution Pipeline (Phase 3) ─────────────────────────────────

  /**
   * Runs the ordered modification pipeline for changes involving >3 files.
   * Executes per tier (topological parallelization) with per-file validation.
   */
  async runOrderedModificationPipeline(
    userPrompt: string,
    currentFiles: Record<string, string>,
    tiers: string[][],
    validateFile: (path: string, content: string) => Promise<{ valid: boolean; errorText?: string }>,
    callbacks: PipelineCallbacks,
    options?: { requestId?: string; designSystem?: boolean; skipIntent?: boolean; skipPlanning?: boolean }
  ): Promise<PipelineResult> {
    const contextLogger = options?.requestId
      ? logger.withRequestId(options.requestId)
      : logger;

    // ── Stage 1: Intent ──────────────────────────────────────────────────────
    const intentOutput = options?.skipIntent
      ? null
      : await this.runIntentStage(userPrompt, callbacks, contextLogger);
    if (callbacks.signal?.aborted) throw new Error('Modification cancelled by client');

    // ── Stage 2: Planning ────────────────────────────────────────────────────
    const planOutput = options?.skipPlanning
      ? null
      : await this.runPlanningStage(userPrompt, intentOutput, callbacks, contextLogger);
    if (callbacks.signal?.aborted) throw new Error('Modification cancelled by client');

    callbacks.onStageStart?.('execution', `Applying ordered modifications (${tiers.length} tiers)…`);
    contextLogger.debug('Ordered execution stage start', { tiers: tiers.length });

    const accumulatedChanges = new Map<string, string>();

    let tierIndex = 1;
    for (const tierFiles of tiers) {
      contextLogger.debug(`Executing tier ${tierIndex}/${tiers.length}`, { fileCount: tierFiles.length });
      
      const promises = tierFiles.map(async (filePath) => {
        return this.processFileWithRetry(
          filePath,
          userPrompt,
          currentFiles,
          accumulatedChanges,
          validateFile,
          callbacks,
          options?.designSystem ?? false
        );
      });

      const results = await Promise.all(promises);
      
      for (const result of results) {
        if (result && result.content) {
          accumulatedChanges.set(result.filePath, result.content);
        }
      }
      tierIndex++;
    }

    callbacks.onStageComplete?.('execution');
    contextLogger.info('Ordered execution stage complete');

    const executorContent = Array.from(accumulatedChanges.entries()).map(([path, content]) => ({ path, content }));

    const finalFiles = this.applyModificationsToFiles(currentFiles, executorContent);

    return { intentOutput, planOutput, executorFiles: executorContent, finalFiles };
  }

  private async processFileWithRetry(
    targetFilePath: string,
    userPrompt: string,
    currentFiles: Record<string, string>,
    accumulatedChanges: Map<string, string>,
    validateFile: (path: string, content: string) => Promise<{ valid: boolean; errorText?: string }>,
    callbacks: PipelineCallbacks,
    designSystem: boolean,
    attempt: number = 1
  ): Promise<{ filePath: string; content: string } | null> {
    if (callbacks.signal?.aborted) return null;

    // Build focused prompt for this file
    const prompt = this.buildFocusedPrompt(targetFilePath, userPrompt, currentFiles, accumulatedChanges);
    const systemInstruction = this.promptProvider.getExecutionModificationSystemPrompt(
      userPrompt,
      null, // Intent and plan can be null for focused single-file generation
      null,
      designSystem
    );

    const response = await this.executionProvider.generateStreaming({
      prompt,
      systemInstruction,
      maxOutputTokens: this.promptProvider.tokenBudgets.executionModification,
      signal: callbacks.signal,
      onChunk: callbacks.onExecutionChunk,
    });

    if (!response.success || !response.content) {
      if (attempt === 1) {
        logger.warn(`Execution failed for ${targetFilePath}, retrying...`);
        return this.processFileWithRetry(targetFilePath, userPrompt, currentFiles, accumulatedChanges, validateFile, callbacks, designSystem, 2);
      }
      return null;
    }

    const generatedFiles = this.parseModificationOutput(response.content);
    // Find the targeted file generated content
    const targetFileGen = generatedFiles.find((f: GeneratedFile) => f.path === targetFilePath);
    
    if (!targetFileGen) {
      if (attempt === 1) {
         return this.processFileWithRetry(targetFilePath, userPrompt, currentFiles, accumulatedChanges, validateFile, callbacks, designSystem, 2);
      }
      return null;
    }

    const validation = await validateFile(targetFilePath, targetFileGen.content);
    
    if (!validation.valid) {
      if (attempt === 1) {
        logger.warn(`Validation failed for ${targetFilePath}, retrying...`, { error: validation.errorText });
        return this.processFileWithRetry(targetFilePath, userPrompt, currentFiles, accumulatedChanges, validateFile, callbacks, designSystem, 2);
      }
    }

    return { filePath: targetFilePath, content: targetFileGen.content };
  }

  private buildFocusedPrompt(
    targetFilePath: string,
    userPrompt: string,
    currentFiles: Record<string, string>,
    accumulatedChanges: Map<string, string>
  ): string {
    const lines: string[] = [`User Request: ${userPrompt}\n`];
    lines.push('=== TARGET FILE (modify this full file) ===\n');
    const targetContent = accumulatedChanges.get(targetFilePath) ?? currentFiles[targetFilePath] ?? '';
    lines.push(`--- ${targetFilePath} ---\n${addLineNumbers(targetContent)}\n`);

    lines.push('=== MODIFIED CONTEXT FILES (outlines of other changed files) ===\n');
    let hasContext = false;
    for (const [path, content] of accumulatedChanges.entries()) {
      if (path !== targetFilePath) {
        hasContext = true;
        lines.push(`--- ${path} ---\n${getFileOutline(content, path)}\n`);
      }
    }
    if (!hasContext) lines.push('(No other modified files yet)\n');

    lines.push('Based on the user request and context, output ONLY the JSON object { "files": [...] } for the TARGET FILE. No markdown fences.');
    return lines.join('\n');
  }

  // ─── Private Stage Runners ────────────────────────────────────────────────

  private async runIntentStage(
    userPrompt: string,
    callbacks: PipelineCallbacks,
    contextLogger: ReturnType<typeof logger.withRequestId>
  ): Promise<IntentOutput | null> {
    callbacks.onStageStart?.('intent', 'Analyzing your request…');
    const stageStartMs = Date.now();
    contextLogger.debug('Intent stage start');

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

      contextLogger.info('Intent stage complete', {
        complexity: zodResult.data.complexity,
        features: zodResult.data.features ?? [],
        durationMs: Date.now() - stageStartMs,
      });
      callbacks.onStageComplete?.('intent');
      return zodResult.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      contextLogger.warn('Intent stage failed (degraded)', { error: message });
      callbacks.onStageFailed?.('intent', message);
      return null;
    }
  }

  private async runPlanningStage(
    userPrompt: string,
    intentOutput: IntentOutput | null,
    callbacks: PipelineCallbacks,
    contextLogger: ReturnType<typeof logger.withRequestId>
  ): Promise<PlanOutput | null> {
    const planLabel = intentOutput?.features?.length
      ? `Planning ${intentOutput.features.length} features…`
      : 'Planning architecture…';
    callbacks.onStageStart?.('planning', planLabel);
    const stageStartMs = Date.now();
    contextLogger.debug('Planning stage start');

    try {
      const response = await this.planningProvider.generate({
        prompt: userPrompt,
        systemInstruction: this.promptProvider.getPlanningSystemPrompt(userPrompt, intentOutput),
        maxOutputTokens: this.promptProvider.tokenBudgets.planning,
        responseSchema: PLAN_JSON_SCHEMA,
        signal: callbacks.signal,
      });

      if (!response.success || !response.content) {
        throw new Error(response.error ?? 'Planning stage returned empty content');
      }

      const parsed = JSON.parse(response.content);
      const zodResult = PlanOutputSchema.safeParse(parsed);

      if (!zodResult.success) {
        throw new Error(`Plan schema mismatch: ${zodResult.error.message}`);
      }

      const plan = zodResult.data;
      contextLogger.info('Planning stage complete', {
        fileCount: plan.files.length,
        depCount: plan.dependencies.length,
        filePaths: plan.files.map(f => f.path),
        durationMs: Date.now() - stageStartMs,
      });
      callbacks.onStageComplete?.('planning');
      return plan;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      contextLogger.warn('Planning stage failed (degraded)', { error: message });
      callbacks.onStageFailed?.('planning', message);
      return null;
    }
  }



  private async runExecutionModificationStage(
    userPrompt: string,
    intentOutput: IntentOutput | null,
    planOutput: PlanOutput | null,
    fileSlices: CodeSlice[],
    currentFiles: Record<string, string>,
    callbacks: PipelineCallbacks,
    contextLogger: ReturnType<typeof logger.withRequestId>,
    designSystem: boolean
  ): Promise<GeneratedFile[]> {
    callbacks.onStageStart?.('execution', 'Applying modifications…');
    const stageStartMs = Date.now();
    contextLogger.info('Execution (modification) stage start', {
      primaryFiles: fileSlices.filter(s => s.relevance === 'primary').map(s => s.filePath),
      contextFiles: fileSlices.filter(s => s.relevance === 'context').map(s => s.filePath),
      designSystem,
    });

    // Build the modification user prompt with code context
    const modificationUserPrompt = this.buildModificationUserPrompt(userPrompt, fileSlices, currentFiles);

    const response = await this.executionProvider.generateStreaming({
      prompt: modificationUserPrompt,
      systemInstruction: this.promptProvider.getExecutionModificationSystemPrompt(
        userPrompt,
        intentOutput,
        planOutput,
        designSystem
      ),
      maxOutputTokens: this.promptProvider.tokenBudgets.executionModification,
      signal: callbacks.signal,
      onChunk: callbacks.onExecutionChunk,
    });

    if (!response.success || !response.content) {
      throw new Error(response.error ?? 'Execution stage failed to generate modifications');
    }

    callbacks.onStageComplete?.('execution');
    const parsedFiles = this.parseModificationOutput(response.content);
    contextLogger.info('Execution (modification) stage complete', {
      contentLength: response.content.length,
      parsedFileCount: parsedFiles.length,
      parsedFilePaths: parsedFiles.filter(f => f.path !== '__pipeline_raw__').map(f => f.path),
      durationMs: Date.now() - stageStartMs,
    });

    return parsedFiles;
  }


  /**
   * Parses modification output { files: [{ path, operation, ... }] }
   * into GeneratedFile[] — only extracting files that have content
   * (create / replace_file operations). modify/delete operations are
   * returned as-is for the ModificationEngine to apply via its diff engine.
   *
   * Uses extractJsonFromResponse to handle markdown-fenced output, extra
   * surrounding text, and other common LLM output quirks.
   */
  private parseModificationOutput(content: string): GeneratedFile[] {
    const jsonStr = extractJsonFromResponse(content);

    if (!jsonStr) {
      logger.error('Failed to extract JSON from modification output', {
        contentLength: content.length,
        preview: content.slice(0, 300),
      });
      return [{ path: '__pipeline_raw__', content }];
    }

    try {
      const parsed = JSON.parse(jsonStr);

      // Normalize to an array of file objects:
      // 1. { "files": [...] }  — standard format
      // 2. [ {...}, {...} ]    — bare array (model omitted wrapper)
      // 3. { "path": "..." }  — single file object
      let files: unknown[];
      if (Array.isArray(parsed?.files)) {
        files = parsed.files;
      } else if (Array.isArray(parsed)) {
        files = parsed;
      } else if (typeof parsed?.path === 'string') {
        files = [parsed];
      } else {
        logger.warn('Modification output has unrecognized structure', {
          keys: Object.keys(parsed ?? {}),
          preview: jsonStr.slice(0, 200),
        });
        return [];
      }

      const result = (files as unknown[])
        .filter((f): f is { path: string; content?: string; operation?: string } =>
          typeof (f as { path?: unknown }).path === 'string'
        )
        .map((f) => ({
          path: f.path,
          content: typeof f.content === 'string' ? f.content : JSON.stringify(f),
        }));

      const formatDetected = Array.isArray(parsed?.files) ? 'wrapped' : Array.isArray(parsed) ? 'bare-array' : 'single-object';
      logger.info('Modification output parsed', {
        formatDetected,
        fileCount: result.length,
        filePaths: result.map(f => f.path),
      });
      return result;
    } catch (err) {
      logger.error('Failed to parse extracted JSON from modification output', {
        error: err instanceof Error ? err.message : String(err),
        jsonLength: jsonStr.length,
      });
      return [{ path: '__pipeline_raw__', content }];
    }
  }

  // ─── Prompt Builders ──────────────────────────────────────────────────────

  /**
   * Builds the modification user prompt with primary and context file slices.
   */
  private buildModificationUserPrompt(userPrompt: string, slices: CodeSlice[], currentFiles: Record<string, string>): string {
    const primarySlices = slices.filter((s) => s.relevance === 'primary');
    const contextSlices = slices.filter((s) => s.relevance === 'context');

    const lines: string[] = [];

    // Project map for structural awareness
    const projectMap = buildProjectMap({ files: currentFiles } as any);
    if (projectMap) {
      lines.push(`${projectMap}\n`);
    }

    lines.push(`User Request: ${userPrompt}\n`);

    if (primarySlices.length > 0) {
      lines.push('=== PRIMARY FILES (likely need modification) ===\n');
      for (const slice of primarySlices) {
        lines.push(`--- ${slice.filePath} ---\n${addLineNumbers(slice.content)}\n`);
      }
    }

    if (contextSlices.length > 0) {
      const cappedContext = contextSlices.slice(0, MAX_CONTEXT_SLICES_MODIFICATION);
      lines.push('=== CONTEXT FILES (outlines for reference) ===\n');
      for (const slice of cappedContext) {
        lines.push(`--- ${slice.filePath} ---\n${getFileOutline(slice.content, slice.filePath)}\n`);
      }
    }

    lines.push('Based on the user request, output ONLY the JSON object { "files": [...] } with modified/new files. No markdown fences.');
    return lines.join('\n');
  }

  /**
   * Converts modification output (edit operations) into a flat file map
   * for the review stage. Applies create/replace_file operations directly.
   * For modify/delete ops (whose content is a JSON-encoded operation string),
   * keeps the existing file content so the reviewer sees valid code rather
   * than raw operation JSON. Deleted files are removed from the result.
   * ModificationEngine applies the actual search/replace edits after the pipeline.
   */
  private applyModificationsToFiles(
    currentFiles: Record<string, string>,
    modifications: GeneratedFile[]
  ): GeneratedFile[] {
    const result: Record<string, string> = { ...currentFiles };

    for (const mod of modifications) {
      if (mod.path === '__pipeline_raw__') {
        logger.warn('Skipping unparsed raw pipeline output in applyModificationsToFiles', {
          contentLength: mod.content.length,
        });
        continue;
      }

      // Detect JSON-encoded operation (modify/delete have no file content)
      let encodedOp: { operation?: string } | null = null;
      try {
        const parsed = JSON.parse(mod.content);
        if (parsed && typeof parsed.operation === 'string') {
          encodedOp = parsed;
        }
      } catch {
        // Not JSON — it's a full-content file (create/replace_file)
      }

      if (encodedOp) {
        if (encodedOp.operation === 'delete') {
          delete result[mod.path];
        }
        // modify: keep existing file content — ModificationEngine applies edits later
      } else {
        // create / replace_file: use the full file content directly
        result[mod.path] = mod.content;
      }
    }

    return Object.entries(result).map(([path, content]) => ({ path, content }));
  }
}
