/**
 * @module core/modification-strategy
 * @description ModificationStrategy — IPipelineStrategy implementation for modifying existing projects.
 * Contains all logic from PipelineOrchestrator except the intent stage boilerplate
 * (which is now in pipeline-shared.ts).
 */

import type { AIProvider } from '../ai/ai-provider';
import type { IPromptProvider } from './prompts/prompt-provider';
import type { IntentOutput, PlanOutput } from './schemas';
import { PlanOutputSchema } from './schemas';
import { toSimpleJsonSchema } from './zod-to-json-schema';
import { createLogger } from '../logger';
import type { CodeSlice } from '../analysis/file-planner/types';
import { getFileOutline } from '../analysis/slice-selector';
import { addLineNumbers } from '../diff/prompt-builder';
import { buildProjectMap } from '../analysis/project-map';
import { MAX_CONTEXT_SLICES_MODIFICATION } from '../constants';
import { extractJsonFromResponse } from '../ai/modal-response-parser';
import { getStructuredParseError, parseStructuredOutput } from '../ai/structured-output';
import type { IPipelineStrategy } from './pipeline-strategy';
import type { UnifiedPipelineCallbacks } from './pipeline-shared';
import type { ProjectState } from '@ai-app-builder/shared';

const logger = createLogger('ModificationStrategy');

const PLAN_JSON_SCHEMA = toSimpleJsonSchema(PlanOutputSchema);

// ─── Public Types (forwarded from pipeline-orchestrator for compat) ───────────

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

// ─── ModificationStrategy ─────────────────────────────────────────────────────

export class ModificationStrategy implements IPipelineStrategy<PlanOutput, PipelineResult> {
  constructor(
    private readonly planningProvider: AIProvider,
    private readonly executionProvider: AIProvider,
    private readonly promptProvider: IPromptProvider,
    private readonly currentFiles: Record<string, string>,
    private readonly fileSlices: CodeSlice[],
    /** Optional topological tiers — when set, ordered execution is used. */
    private readonly tiers?: string[][],
    /** Per-file validation callback used in ordered execution. */
    private readonly validateFile?: (path: string, content: string) => Promise<{ valid: boolean; errorText?: string }>,
  ) {}

  planningLabel(intentOutput: unknown): string {
    const typed = intentOutput as IntentOutput | null;
    return typed?.features?.length
      ? `Planning ${typed.features.length} features…`
      : 'Planning architecture…';
  }

  canSkipPlanning(): boolean {
    return false;
  }

  async runPlanning(
    userPrompt: string,
    intentOutput: unknown,
    callbacks: UnifiedPipelineCallbacks,
    options?: Record<string, unknown>,
  ): Promise<PlanOutput> {
    const typedIntentOutput = intentOutput as IntentOutput | null;
    const requestId = options?.['requestId'] as string | undefined;
    const contextLogger = requestId ? logger.withRequestId(requestId) : logger;

    const planLabel = this.planningLabel(typedIntentOutput);
    callbacks.onStageStart?.('planning', planLabel);
    const stageStartMs = Date.now();
    contextLogger.debug('Planning stage start');

    try {
      const response = await this.planningProvider.generate({
        prompt: userPrompt,
        systemInstruction: this.promptProvider.getPlanningSystemPrompt(userPrompt, typedIntentOutput),
        maxOutputTokens: this.promptProvider.tokenBudgets.planning,
        responseSchema: PLAN_JSON_SCHEMA,
        signal: callbacks.signal,
      });

      if (!response.success || !response.content) {
        throw new Error(response.error ?? 'Planning stage returned empty content');
      }

      const parsedResult = parseStructuredOutput(response.content, PlanOutputSchema, 'PlanOutput');
      if (!parsedResult.success) {
        const parseError = getStructuredParseError(parsedResult);
        throw new Error(parseError);
      }

      const plan = parsedResult.data;
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
      // Return a minimal plan so the execution stage can still proceed
      return { files: [], components: [], dependencies: [], routing: [] };
    }
  }

  async runExecution(
    userPrompt: string,
    intentOutput: unknown,
    planContext: PlanOutput | null,
    callbacks: UnifiedPipelineCallbacks,
    options?: Record<string, unknown>,
  ): Promise<PipelineResult> {
    const typedIntentOutput = intentOutput as IntentOutput | null;
    // planContext may be null when planning was skipped
    const planOutput = planContext && planContext.files.length > 0 ? planContext : null;
    const designSystem = options?.['designSystem'] as boolean ?? false;
    const requestId = options?.['requestId'] as string | undefined;
    const contextLogger = requestId ? logger.withRequestId(requestId) : logger;

    if (this.tiers && this.validateFile) {
      return this.runOrderedExecution(
        userPrompt,
        typedIntentOutput,
        planOutput,
        callbacks,
        contextLogger,
        designSystem
      );
    }

    return this.runStandardExecution(
      userPrompt,
      typedIntentOutput,
      planOutput,
      callbacks,
      contextLogger,
      designSystem
    );
  }

  // ─── Standard (non-ordered) execution ─────────────────────────────────────

  private async runStandardExecution(
    userPrompt: string,
    intentOutput: IntentOutput | null,
    planOutput: PlanOutput | null,
    callbacks: UnifiedPipelineCallbacks,
    contextLogger: ReturnType<typeof logger.withRequestId>,
    designSystem: boolean,
  ): Promise<PipelineResult> {
    callbacks.onStageStart?.('execution', 'Applying modifications…');
    const stageStartMs = Date.now();
    contextLogger.info('Execution (modification) stage start', {
      primaryFiles: this.fileSlices.filter(s => s.relevance === 'primary').map(s => s.filePath),
      contextFiles: this.fileSlices.filter(s => s.relevance === 'context').map(s => s.filePath),
      designSystem,
    });

    const modificationUserPrompt = this.buildModificationUserPrompt(userPrompt, this.fileSlices, this.currentFiles);

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

    const finalFiles = this.applyModificationsToFiles(this.currentFiles, parsedFiles);
    return { intentOutput, planOutput, executorFiles: parsedFiles, finalFiles };
  }

  // ─── Ordered (per-tier) execution ─────────────────────────────────────────

  private async runOrderedExecution(
    userPrompt: string,
    intentOutput: IntentOutput | null,
    planOutput: PlanOutput | null,
    callbacks: UnifiedPipelineCallbacks,
    contextLogger: ReturnType<typeof logger.withRequestId>,
    designSystem: boolean,
  ): Promise<PipelineResult> {
    const tiers = this.tiers!;
    const validateFile = this.validateFile!;

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
          this.currentFiles,
          accumulatedChanges,
          validateFile,
          callbacks,
          designSystem
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
    const finalFiles = this.applyModificationsToFiles(this.currentFiles, executorContent);

    return { intentOutput, planOutput, executorFiles: executorContent, finalFiles };
  }

  private async processFileWithRetry(
    targetFilePath: string,
    userPrompt: string,
    currentFiles: Record<string, string>,
    accumulatedChanges: Map<string, string>,
    validateFile: (path: string, content: string) => Promise<{ valid: boolean; errorText?: string }>,
    callbacks: UnifiedPipelineCallbacks,
    designSystem: boolean,
    attempt: number = 1
  ): Promise<{ filePath: string; content: string } | null> {
    if (callbacks.signal?.aborted) return null;

    const prompt = this.buildFocusedPrompt(targetFilePath, userPrompt, currentFiles, accumulatedChanges);
    const systemInstruction = this.promptProvider.getExecutionModificationSystemPrompt(
      userPrompt,
      null,
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

  // ─── Prompt Builders ──────────────────────────────────────────────────────

  private buildModificationUserPrompt(userPrompt: string, slices: CodeSlice[], currentFiles: Record<string, string>): string {
    const primarySlices = slices.filter((s) => s.relevance === 'primary');
    const contextSlices = slices.filter((s) => s.relevance === 'context');

    const lines: string[] = [];

    const projectMap = buildProjectMap({ files: currentFiles } as ProjectState);
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
