/**
 * Streaming Project Generator
 * Generates projects with incremental file streaming via SSE using the 4-stage pipeline.
 */

import { v4 as uuidv4 } from 'uuid';
import type { ProjectState, Version, OperationResult } from '@ai-app-builder/shared';
import type { AIProvider } from '../ai';
import type { IPromptProvider } from './prompts/prompt-provider';
import { createPromptProvider } from './prompts/prompt-provider-factory';
import { getEffectiveProvider } from '../ai/provider-config-store';
import { processFiles } from './file-processor';
import { createLogger } from '../logger';
import { BaseProjectGenerator } from './base-project-generator';
import type { PipelineCallbacks, PipelineStage } from './pipeline-orchestrator';
import { createGenerationPipeline } from './pipeline-factory';
import { GenerationPipeline, GenerationResult } from './generation-pipeline';
import type { PipelineCallbacks as GenerationCallbacks, PhaseProgressData, PhaseCompleteData } from './generation-pipeline';

const logger = createLogger('StreamingGenerator');

const APP_IMPORT_PATTERN = /import\s+App\s+from\s+['"]\.\/App(?:\.[^'"]+)?['"]/;
const INDEX_CSS_IMPORT_PATTERN = /import\s+['"]\.\/index\.css['"]/;
const CREATE_ROOT_PATTERN = /(?:ReactDOM\.)?createRoot\s*\(/;

function hasValidMainEntrypoint(content: string): boolean {
  return (
    APP_IMPORT_PATTERN.test(content) &&
    INDEX_CSS_IMPORT_PATTERN.test(content) &&
    CREATE_ROOT_PATTERN.test(content)
  );
}

/**
 * Callback for streaming events.
 */
export interface StreamingCallbacks {
  onStart?: () => void;
  onProgress?: (length: number) => void;
  onFile?: (data: { path: string; content: string; index: number; total: number; status: 'complete' | 'partial' }) => void;
  onWarning?: (data: { path: string; message: string; type: 'formatting' | 'validation' }) => void;
  onStreamEnd?: (summary: { totalFiles: number; successfulFiles: number; failedFiles: number; warnings: number }) => void;
  onComplete?: (result: { projectState: ProjectState; version: Version; selectedRecipeId: string | null }) => void;
  onError?: (error: string, errorData?: { errorCode?: string; errorType?: string; partialContent?: string }) => void;
  onHeartbeat?: () => void;
  onPipelineStage?: (data: { stage: PipelineStage; label: string; status: 'start' | 'complete' | 'degraded' }) => void;
  onPhaseStart?: (data: PhaseProgressData) => void;
  onPhaseComplete?: (data: PhaseCompleteData) => void;
  signal?: AbortSignal;
}

/**
 * Result of streaming generation.
 * Alias for OperationResult from shared package.
 */
export type StreamingGenerationResult = OperationResult;

/**
 * Streaming Project Generator that emits files as they're generated.
 */
export class StreamingProjectGenerator extends BaseProjectGenerator {
  constructor(
    private readonly pipeline: GenerationPipeline,
    bugfixProvider: AIProvider,
    promptProvider: IPromptProvider
  ) {
    super(bugfixProvider, promptProvider);
  }

  async generateProjectStreaming(
    description: string,
    callbacks: StreamingCallbacks,
    options?: { requestId?: string; beginnerMode?: boolean }
  ): Promise<StreamingGenerationResult> {
    if (!description || description.trim() === '') {
      return {
        success: false,
        error: 'Project description is required',
      };
    }

    const contextLogger = options?.requestId ? logger.withRequestId(options.requestId) : logger;

    contextLogger.debug('Starting streaming project generation via pipeline', {
      descriptionLength: description.length,
    });

    callbacks.onStart?.();

    const emittedFiles = new Set<string>();
    let warningCount = 0;
    let plannedTotal = 0;
    const classifyGenerationErrorType = (message: string): 'ai_output' | 'validation' | 'timeout' | 'unknown' => {
      const lower = message.toLowerCase();
      if (lower.includes('timed out') || lower.includes('timeout')) return 'timeout';
      if (
        lower.includes('acceptance') ||
        lower.includes('schema mismatch') ||
        lower.includes('parse failed') ||
        lower.includes('could not extract valid json') ||
        lower.includes('generated 0/') ||
        lower.includes('missing or invalid required scaffold files') ||
        lower.includes('planning stage failed after retry')
      ) {
        return 'ai_output';
      }
      if (lower.includes('validation')) return 'validation';
      return 'unknown';
    };

    const pipelineCallbacks: GenerationCallbacks = {
      onStageStart: (stage, label) => {
        contextLogger.debug('Pipeline stage start', { stage, label });
        callbacks.onPipelineStage?.({ stage: stage as PipelineStage, label, status: 'start' });
      },
      onStageComplete: (stage) => {
        contextLogger.debug('Pipeline stage complete', { stage });
        callbacks.onPipelineStage?.({ stage: stage as PipelineStage, label: '', status: 'complete' });
      },
      onStageFailed: (stage, error) => {
        contextLogger.warn('Pipeline stage failed (degraded)', { stage, error });
        callbacks.onPipelineStage?.({ stage: stage as PipelineStage, label: error, status: 'degraded' });
      },
      onProgress: (accumulatedLength) => {
        callbacks.onProgress?.(accumulatedLength);
      },
      onPhaseStart: (data) => {
        plannedTotal += data.filesInPhase;
        callbacks.onPhaseStart?.(data);
      },
      onPhaseComplete: (data) => {
        callbacks.onPhaseComplete?.(data);
      },
      onFileStream: (file, isComplete) => {
        if (!emittedFiles.has(file.path) || isComplete) {
          emittedFiles.add(file.path);
          callbacks.onFile?.({
            path: file.path,
            content: file.content,
            index: emittedFiles.size - 1,
            total: plannedTotal > 0 ? plannedTotal : Math.max(emittedFiles.size, 10),
            status: isComplete ? 'complete' : 'partial',
          });
        }
      },
      signal: callbacks.signal,
    };

    let pipelineResult: GenerationResult;
    try {
      pipelineResult = await this.pipeline.runGeneration(
        description,
        pipelineCallbacks,
        {
          requestId: options?.requestId,
          beginnerMode: options?.beginnerMode,
        }
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Pipeline execution failed';
      contextLogger.error('Pipeline threw during generation', {
        errorMessage: error,
        stack: err instanceof Error ? err.stack : undefined,
        descriptionLength: description.length,
        emittedFilesSoFar: Array.from(emittedFiles),
      });
      callbacks.onError?.(error, { errorType: classifyGenerationErrorType(error) });
      callbacks.onStreamEnd?.({
        totalFiles: emittedFiles.size,
        successfulFiles: 0,
        failedFiles: emittedFiles.size,
        warnings: warningCount,
      });
      return { success: false, error };
    }

    contextLogger.info('Pipeline complete, processing files', {
      fileCount: pipelineResult.generatedFiles.length,
      intentCompleted: !!pipelineResult.intentOutput,
      planCompleted: !!pipelineResult.architecturePlan,
    });

    for (const warning of pipelineResult.warnings) {
      callbacks.onWarning?.({
        path: '__pipeline__',
        message: warning,
        type: 'validation',
      });
      warningCount++;
    }

    const hasPkgJson = pipelineResult.generatedFiles.some((f) => f.path === 'package.json');
    const mainEntry = pipelineResult.generatedFiles.find(
      (f) => f.path === 'src/main.tsx' || f.path === 'main.tsx'
    );
    const mainTsxContent = mainEntry?.content ?? '';
    const mainIsInvalid = !mainEntry || !hasValidMainEntrypoint(mainTsxContent);
    const mainIsPlaceholder = mainTsxContent.includes('Subsequent phases');

    if (!hasPkgJson || mainIsInvalid || mainIsPlaceholder) {
      const missingArtifacts = [
        !hasPkgJson ? 'package.json' : null,
        mainIsInvalid || mainIsPlaceholder ? 'src/main.tsx' : null,
      ].filter(Boolean);
      const error = `Generation failed acceptance: missing or invalid required scaffold files (${missingArtifacts.join(', ')})`;
      contextLogger.error(error, {
        generatedFiles: pipelineResult.generatedFiles.map((file) => file.path),
      });
      callbacks.onError?.(error, { errorCode: 'generation_acceptance_failed', errorType: 'ai_output' });
      callbacks.onStreamEnd?.({
        totalFiles: emittedFiles.size,
        successfulFiles: 0,
        failedFiles: emittedFiles.size,
        warnings: warningCount,
      });
      return { success: false, error };
    }

    const processResult = await processFiles(pipelineResult.generatedFiles, { addFrontendPrefix: false });
    const prefixedFiles = processResult.files;

    for (const warning of processResult.warnings) {
      callbacks.onWarning?.({
        path: warning.path,
        message: warning.message,
        type: warning.type,
      });
      warningCount++;
    }

    contextLogger.debug('Checking for syntax errors before build-fix', { files: Object.keys(prefixedFiles) });
    const acceptanceResult = this.acceptanceGate.validate(prefixedFiles, {
      beginnerMode: options?.beginnerMode,
    });
    if (!acceptanceResult.valid || !acceptanceResult.sanitizedOutput) {
      const error = `Generation failed acceptance: ${acceptanceResult.issues
        .map((issue) => `${issue.file ?? 'unknown'}: ${issue.message}`)
        .join('; ')}`;
      contextLogger.error('Generated files failed acceptance before build-fix', {
        issueCount: acceptanceResult.issues.length,
        issues: acceptanceResult.issues,
      });
      callbacks.onError?.(error, { errorCode: 'generation_acceptance_failed', errorType: 'validation' });
      callbacks.onStreamEnd?.({
        totalFiles: Object.keys(prefixedFiles).length,
        successfulFiles: 0,
        failedFiles: Object.keys(prefixedFiles).length,
        warnings: warningCount,
      });
      return { success: false, error };
    }

    if (callbacks.signal?.aborted) {
      contextLogger.info('Generation aborted by client before build-fix loop');
      return {
        success: false,
        error: 'Generation cancelled by client',
      };
    }

    const finalFiles = await this.runBuildFixLoop(
      acceptanceResult.sanitizedOutput,
      description,
      options?.requestId
    );

    if (callbacks.signal?.aborted) {
      contextLogger.info('Generation aborted by client after build-fix loop');
      return {
        success: false,
        error: 'Generation cancelled by client',
      };
    }

    const now = new Date();
    const projectId = uuidv4();
    const versionId = uuidv4();

    const projectState: ProjectState = {
      id: projectId,
      name: this.extractProjectName(description, pipelineResult.intentOutput),
      description,
      files: finalFiles,
      createdAt: now,
      updatedAt: now,
      currentVersionId: versionId,
    };

    const version: Version = {
      id: versionId,
      projectId,
      prompt: description,
      timestamp: now,
      files: finalFiles,
      diffs: this.computeInitialDiffs(finalFiles),
      parentVersionId: null,
    };

    const fileEntries = Object.entries(finalFiles);
    for (let i = 0; i < fileEntries.length; i++) {
      const [path, content] = fileEntries[i];
      callbacks.onFile?.({
        path,
        content,
        index: i,
        total: fileEntries.length,
        status: 'complete',
      });
    }

    callbacks.onComplete?.({
      projectState,
      version,
      selectedRecipeId: pipelineResult.selectedRecipeId,
    });
    callbacks.onStreamEnd?.({
      totalFiles: fileEntries.length,
      successfulFiles: fileEntries.length,
      failedFiles: 0,
      warnings: warningCount,
    });

    return {
      success: true,
      projectState,
      version,
    };
  }
}

/**
 * Creates a StreamingProjectGenerator with the full pipeline + bugfix provider.
 */
export async function createStreamingProjectGenerator(overrideProvider?: AIProvider): Promise<StreamingProjectGenerator> {
  if (overrideProvider) {
    const providerName = await getEffectiveProvider();
    const promptProvider = createPromptProvider(providerName);
    const pipeline = new GenerationPipeline(
      overrideProvider, overrideProvider, overrideProvider,
      overrideProvider, overrideProvider, promptProvider
    );
    return new StreamingProjectGenerator(pipeline, overrideProvider, promptProvider);
  }
  const [pipeline, providerName] = await Promise.all([
    createGenerationPipeline(),
    getEffectiveProvider(),
  ]);
  const promptProvider = createPromptProvider(providerName);
  return new StreamingProjectGenerator(pipeline, pipeline.bugfixProvider, promptProvider);
}
