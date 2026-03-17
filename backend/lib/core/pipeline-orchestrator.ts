/**
 * @module core/pipeline-orchestrator
 * @description 4-stage AI pipeline: Intent → Planning → Execution → Review.
 *
 * Graceful degradation model:
 * - Intent, Planning, Review: non-fatal — null output on failure, pipeline continues
 * - Execution: hard-fail — throws so the route handler can return 500
 *
 * PipelineOrchestrator is stateless; create a new instance per request via
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
import type { IntentOutput, PlanOutput, ReviewOutput } from './schemas';
import { IntentOutputSchema, PlanOutputSchema, ReviewOutputSchema } from './schemas';
import { toSimpleJsonSchema } from './zod-to-json-schema';
import { createLogger } from '../logger';
import type { CodeSlice } from '../analysis/file-planner/types';
import { MAX_REVIEW_CONTENT_CHARS } from '../constants';

const logger = createLogger('PipelineOrchestrator');

// JSON schemas passed to the AI as responseSchema (for structured output)
const INTENT_JSON_SCHEMA = toSimpleJsonSchema(IntentOutputSchema);
const PLAN_JSON_SCHEMA = toSimpleJsonSchema(PlanOutputSchema);
const REVIEW_JSON_SCHEMA = toSimpleJsonSchema(ReviewOutputSchema);

// ─── Public Types ─────────────────────────────────────────────────────────────

/** Stages emitted as SSE events. Bugfix is an internal loop — not a public stage. */
export type PipelineStage = 'intent' | 'planning' | 'execution' | 'review';

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
  /** Raw files returned by the execution stage (before review corrections). */
  executorFiles: GeneratedFile[];
  reviewOutput: ReviewOutput | null;
  /** Final files after merging review corrections into executorFiles. */
  finalFiles: GeneratedFile[];
}

// ─── PipelineOrchestrator ────────────────────────────────────────────────────

export class PipelineOrchestrator {
  constructor(
    private readonly intentProvider: AIProvider,
    private readonly planningProvider: AIProvider,
    private readonly executionProvider: AIProvider,
    private readonly reviewProvider: AIProvider,
    private readonly promptProvider: IPromptProvider
  ) {}

  // ─── Generation Pipeline ──────────────────────────────────────────────────

  /**
   * Runs the full 4-stage generation pipeline for a new project.
   *
   * @param userPrompt - The user's project description
   * @param callbacks - Stage lifecycle + streaming callbacks
   * @param options - Optional request metadata
   */
  async runGenerationPipeline(
    userPrompt: string,
    callbacks: PipelineCallbacks,
    options?: { requestId?: string }
  ): Promise<PipelineResult> {
    const contextLogger = options?.requestId
      ? logger.withRequestId(options.requestId)
      : logger;

    // ── Stage 1: Intent ──────────────────────────────────────────────────────
    const intentOutput = await this.runIntentStage(userPrompt, callbacks, contextLogger);

    if (callbacks.signal?.aborted) throw new Error('Generation cancelled by client');

    // ── Stage 2: Planning ────────────────────────────────────────────────────
    const planOutput = await this.runPlanningStage(userPrompt, intentOutput, callbacks, contextLogger);

    if (callbacks.signal?.aborted) throw new Error('Generation cancelled by client');

    // ── Stage 3: Execution (hard-fail) ───────────────────────────────────────
    const executorContent = await this.runExecutionGenerationStage(
      userPrompt,
      intentOutput,
      planOutput,
      callbacks,
      contextLogger
    );

    if (callbacks.signal?.aborted) throw new Error('Generation cancelled by client');

    // ── Stage 4: Review ──────────────────────────────────────────────────────
    const reviewOutput = await this.runReviewStage(executorContent, callbacks, contextLogger);

    const finalFiles = this.mergeReviewCorrections(executorContent, reviewOutput);

    return { intentOutput, planOutput, executorFiles: executorContent, reviewOutput, finalFiles };
  }

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
    options?: { requestId?: string; designSystem?: boolean }
  ): Promise<PipelineResult> {
    const contextLogger = options?.requestId
      ? logger.withRequestId(options.requestId)
      : logger;

    // ── Stage 1: Intent ──────────────────────────────────────────────────────
    const intentOutput = await this.runIntentStage(userPrompt, callbacks, contextLogger);

    if (callbacks.signal?.aborted) throw new Error('Modification cancelled by client');

    // ── Stage 2: Planning ────────────────────────────────────────────────────
    const planOutput = await this.runPlanningStage(userPrompt, intentOutput, callbacks, contextLogger);

    if (callbacks.signal?.aborted) throw new Error('Modification cancelled by client');

    // ── Stage 3: Execution (hard-fail) ───────────────────────────────────────
    const executorContent = await this.runExecutionModificationStage(
      userPrompt,
      intentOutput,
      planOutput,
      fileSlices,
      callbacks,
      contextLogger,
      options?.designSystem ?? false
    );

    if (callbacks.signal?.aborted) throw new Error('Modification cancelled by client');

    // ── Stage 4: Review ──────────────────────────────────────────────────────
    // Build review files: current files overlaid with executor modifications
    const mergedForReview = this.applyModificationsToFiles(currentFiles, executorContent);
    const reviewOutput = await this.runReviewStage(mergedForReview, callbacks, contextLogger);

    const finalFiles = this.mergeReviewCorrections(mergedForReview, reviewOutput);

    return { intentOutput, planOutput, executorFiles: executorContent, reviewOutput, finalFiles };
  }

  // ─── Correction Merger ────────────────────────────────────────────────────

  /**
   * Path-keyed overlay: replaces executor files with reviewer corrections.
   * Files not present in corrections are returned unchanged.
   */
  mergeReviewCorrections(
    executorFiles: GeneratedFile[],
    reviewOutput: ReviewOutput | null
  ): GeneratedFile[] {
    if (!reviewOutput || reviewOutput.verdict === 'pass' || reviewOutput.corrections.length === 0) {
      return executorFiles;
    }

    const correctionMap = new Map(
      reviewOutput.corrections.map((c) => [c.path, c.content])
    );

    const merged = executorFiles.map((file) =>
      correctionMap.has(file.path)
        ? { path: file.path, content: correctionMap.get(file.path)! }
        : file
    );

    // Add any new files introduced by review corrections
    for (const correction of reviewOutput.corrections) {
      if (!executorFiles.some((f) => f.path === correction.path)) {
        merged.push({ path: correction.path, content: correction.content });
      }
    }

    logger.info('Review corrections applied', {
      verdict: reviewOutput.verdict,
      correctionCount: reviewOutput.corrections.length,
    });

    return merged;
  }

  // ─── Private Stage Runners ────────────────────────────────────────────────

  private async runIntentStage(
    userPrompt: string,
    callbacks: PipelineCallbacks,
    contextLogger: ReturnType<typeof logger.withRequestId>
  ): Promise<IntentOutput | null> {
    callbacks.onStageStart?.('intent', 'Analyzing your request…');
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

      contextLogger.info('Intent stage complete', { complexity: zodResult.data.complexity });
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
    callbacks.onStageStart?.('planning', 'Planning architecture…');
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

      contextLogger.info('Planning stage complete', {
        fileCount: zodResult.data.files.length,
        depCount: zodResult.data.dependencies.length,
      });
      callbacks.onStageComplete?.('planning');
      return zodResult.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      contextLogger.warn('Planning stage failed (degraded)', { error: message });
      callbacks.onStageFailed?.('planning', message);
      return null;
    }
  }

  private async runExecutionGenerationStage(
    userPrompt: string,
    intentOutput: IntentOutput | null,
    planOutput: PlanOutput | null,
    callbacks: PipelineCallbacks,
    contextLogger: ReturnType<typeof logger.withRequestId>
  ): Promise<GeneratedFile[]> {
    callbacks.onStageStart?.('execution', 'Generating application…');
    contextLogger.debug('Execution (generation) stage start');

    const response = await this.executionProvider.generateStreaming({
      prompt: 'Generate the project based on the user request in the system instruction.',
      systemInstruction: this.promptProvider.getExecutionGenerationSystemPrompt(
        userPrompt,
        intentOutput,
        planOutput
      ),
      maxOutputTokens: this.promptProvider.tokenBudgets.executionGeneration,
      signal: callbacks.signal,
      onChunk: callbacks.onExecutionChunk,
    });

    if (!response.success || !response.content) {
      throw new Error(response.error ?? 'Execution stage failed to generate project');
    }

    callbacks.onStageComplete?.('execution');
    contextLogger.info('Execution (generation) stage complete', {
      contentLength: response.content.length,
    });

    return this.parseProjectOutput(response.content);
  }

  private async runExecutionModificationStage(
    userPrompt: string,
    intentOutput: IntentOutput | null,
    planOutput: PlanOutput | null,
    fileSlices: CodeSlice[],
    callbacks: PipelineCallbacks,
    contextLogger: ReturnType<typeof logger.withRequestId>,
    designSystem: boolean
  ): Promise<GeneratedFile[]> {
    callbacks.onStageStart?.('execution', 'Applying modifications…');
    contextLogger.debug('Execution (modification) stage start');

    // Build the modification user prompt with code context
    const modificationUserPrompt = this.buildModificationUserPrompt(userPrompt, fileSlices);

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
    contextLogger.info('Execution (modification) stage complete', {
      contentLength: response.content.length,
    });

    return this.parseModificationOutput(response.content);
  }

  private async runReviewStage(
    files: GeneratedFile[],
    callbacks: PipelineCallbacks,
    contextLogger: ReturnType<typeof logger.withRequestId>
  ): Promise<ReviewOutput | null> {
    callbacks.onStageStart?.('review', 'Reviewing for errors…');
    contextLogger.debug('Review stage start', { fileCount: files.length });

    try {
      const reviewPrompt = this.buildReviewUserPrompt(files);

      const response = await this.reviewProvider.generate({
        prompt: reviewPrompt,
        systemInstruction: this.promptProvider.getReviewSystemPrompt(),
        maxOutputTokens: this.promptProvider.tokenBudgets.review,
        responseSchema: REVIEW_JSON_SCHEMA,
        signal: callbacks.signal,
      });

      if (!response.success || !response.content) {
        throw new Error(response.error ?? 'Review stage returned empty content');
      }

      const parsed = JSON.parse(response.content);
      const zodResult = ReviewOutputSchema.safeParse(parsed);

      if (!zodResult.success) {
        throw new Error(`Review schema mismatch: ${zodResult.error.message}`);
      }

      contextLogger.info('Review stage complete', {
        verdict: zodResult.data.verdict,
        corrections: zodResult.data.corrections.length,
      });
      callbacks.onStageComplete?.('review');
      return zodResult.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      contextLogger.warn('Review stage failed (degraded)', { error: message });
      callbacks.onStageFailed?.('review', message);
      return null;
    }
  }

  // ─── Output Parsers ───────────────────────────────────────────────────────

  /**
   * Parses raw AI content into GeneratedFile[].
   * Expects JSON in the shape { files: [{ path, content }] }.
   * Returns an empty array on parse failure (caller handles validation).
   */
  private parseProjectOutput(content: string): GeneratedFile[] {
    try {
      const parsed = JSON.parse(content);
      const files = parsed?.files;
      if (!Array.isArray(files)) return [];
      return files
        .filter((f: unknown) => typeof (f as { path?: unknown }).path === 'string')
        .map((f: { path: string; content?: string }) => ({
          path: f.path,
          content: typeof f.content === 'string' ? f.content : '',
        }));
    } catch {
      return [];
    }
  }

  /**
   * Parses modification output { files: [{ path, operation, ... }] }
   * into GeneratedFile[] — only extracting files that have content
   * (create / replace_file operations). modify/delete operations are
   * returned as-is for the ModificationEngine to apply via its diff engine.
   *
   * Returns raw JSON string wrapped in an array entry so ModificationEngine
   * can consume it unchanged.
   */
  private parseModificationOutput(content: string): GeneratedFile[] {
    try {
      const parsed = JSON.parse(content);
      const files = parsed?.files;
      if (!Array.isArray(files)) return [];
      return files
        .filter((f: unknown) => typeof (f as { path?: unknown }).path === 'string')
        .map((f: { path: string; content?: string; operation?: string }) => ({
          path: f.path,
          content: typeof f.content === 'string' ? f.content : JSON.stringify(f),
        }));
    } catch {
      // Return raw content wrapped as a single file for ModificationEngine to parse
      return [{ path: '__pipeline_raw__', content }];
    }
  }

  // ─── Prompt Builders ──────────────────────────────────────────────────────

  /**
   * Builds the review user prompt by serializing files into labeled sections.
   * Truncates combined content to MAX_REVIEW_CONTENT_CHARS to stay within budget.
   */
  private buildReviewUserPrompt(files: GeneratedFile[]): string {
    const sections: string[] = ['Review the following React application files for errors:\n'];
    let totalChars = sections[0].length;

    for (const file of files) {
      const section = `=== ${file.path} ===\n${file.content}\n\n`;
      if (totalChars + section.length > MAX_REVIEW_CONTENT_CHARS) {
        sections.push(`[... ${files.length - sections.length + 1} more files truncated to fit review budget]\n`);
        break;
      }
      sections.push(section);
      totalChars += section.length;
    }

    return sections.join('');
  }

  /**
   * Builds the modification user prompt with primary and context file slices.
   */
  private buildModificationUserPrompt(userPrompt: string, slices: CodeSlice[]): string {
    const primarySlices = slices.filter((s) => s.relevance === 'primary');
    const contextSlices = slices.filter((s) => s.relevance === 'context');

    const lines: string[] = [`User Request: ${userPrompt}\n`];

    if (primarySlices.length > 0) {
      lines.push('=== PRIMARY FILES (likely need modification) ===\n');
      for (const slice of primarySlices) {
        lines.push(`--- ${slice.filePath} ---\n${slice.content}\n`);
      }
    }

    if (contextSlices.length > 0) {
      lines.push('=== CONTEXT FILES (for reference) ===\n');
      for (const slice of contextSlices) {
        lines.push(`--- ${slice.filePath} ---\n${slice.content}\n`);
      }
    }

    lines.push('Based on the user request, output ONLY the JSON with modified/new files.');
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
      if (mod.path === '__pipeline_raw__') continue;

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
