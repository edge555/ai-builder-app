/**
 * Streaming Project Generator
 * Generates projects with incremental file streaming via SSE using the 4-stage pipeline.
 */

import { v4 as uuidv4 } from 'uuid';
import type { ProjectState, Version, OperationResult } from '@ai-app-builder/shared';
import type { AIProvider } from '../ai';
import { createAIProvider } from '../ai';
import type { IPromptProvider } from './prompts/prompt-provider';
import { createPromptProvider } from './prompts/prompt-provider-factory';
import { getEffectiveProvider } from '../ai/provider-config-store';
import { processFiles } from './file-processor';
import { createLogger } from '../logger';
import { parseIncrementalFiles, estimateTotalFiles } from '../utils/incremental-json-parser';
import { BaseProjectGenerator } from './base-project-generator';
import type { PipelineCallbacks, PipelineStage } from './pipeline-orchestrator';
import { createGenerationPipeline } from './pipeline-factory';
import { GenerationPipeline, GenerationResult } from './generation-pipeline';
import type { PipelineCallbacks as GenerationCallbacks, PhaseProgressData, PhaseCompleteData } from './generation-pipeline';

const logger = createLogger('StreamingGenerator');

/**
 * Callback for streaming events.
 */
export interface StreamingCallbacks {
  onStart?: () => void;
  onProgress?: (length: number) => void;
  onFile?: (data: { path: string; content: string; index: number; total: number; status: 'complete' | 'partial' }) => void;
  onWarning?: (data: { path: string; message: string; type: 'formatting' | 'validation' }) => void;
  onStreamEnd?: (summary: { totalFiles: number; successfulFiles: number; failedFiles: number; warnings: number }) => void;
  onComplete?: (result: { projectState: ProjectState; version: Version }) => void;
  onError?: (error: string, errorData?: { errorCode?: string; errorType?: string; partialContent?: string }) => void;
  onHeartbeat?: () => void;
  /** Emitted at each pipeline stage transition (start/complete/degraded) */
  onPipelineStage?: (data: { stage: PipelineStage; label: string; status: 'start' | 'complete' | 'degraded' }) => void;
  /** Emitted when a generation phase starts (richer data than pipeline-stage) */
  onPhaseStart?: (data: PhaseProgressData) => void;
  /** Emitted when a generation phase completes (richer data than pipeline-stage) */
  onPhaseComplete?: (data: PhaseCompleteData) => void;
  /** Optional abort signal to cancel generation on client disconnect */
  signal?: AbortSignal;
}

/**
 * Result of streaming generation.
 * Alias for OperationResult from shared package.
 */
export type StreamingGenerationResult = OperationResult;

/**
 * Streaming Project Generator that emits files as they're generated.
 * Delegates to the 4-stage PipelineOrchestrator for Intent → Planning → Execution → Review.
 */
export class StreamingProjectGenerator extends BaseProjectGenerator {
  constructor(
    private readonly pipeline: GenerationPipeline,
    bugfixProvider: AIProvider,
    promptProvider: IPromptProvider
  ) {
    super(bugfixProvider, promptProvider);
  }

  /**
   * Generates a project with streaming file emission via the pipeline.
   * @param description - The project description
   * @param callbacks - Streaming event callbacks
   * @param options - Optional configuration
   * @param options.requestId - Request ID for correlation across logs
   */
  async generateProjectStreaming(
    description: string,
    callbacks: StreamingCallbacks,
    options?: { requestId?: string }
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

    // Track parsed files for incremental emission during streaming
    let accumulatedText = '';
    let lastParsedIndex = 0;
    const emittedFiles = new Set<string>();
    let warningCount = 0;

    // Map pipeline callbacks to StreamingCallbacks
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
        callbacks.onPhaseStart?.(data);
      },
      onPhaseComplete: (data) => {
        callbacks.onPhaseComplete?.(data);
      },
      onFileStream: (file, isComplete) => {
        if (!emittedFiles.has(file.path) || isComplete) {
          emittedFiles.add(file.path);
          // Just use the set size, or wait for finalization.
          callbacks.onFile?.({
            path: file.path,
            content: file.content,
            index: emittedFiles.size - 1,
            total: Math.max(emittedFiles.size, 10), // Total isn't cleanly known during multi-phase easily without passing ArchitecturePlan through, so passing an estimate
            status: isComplete ? 'complete' : 'partial',
          });
        }
      },
      signal: callbacks.signal,
    };

    // Run the generation pipeline
    let pipelineResult: GenerationResult;
    try {
      pipelineResult = await this.pipeline.runGeneration(
        description,
        pipelineCallbacks,
        { requestId: options?.requestId }
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Pipeline execution failed';
      callbacks.onError?.(error);
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

    // Process files: sanitize paths, normalize newlines, format with Prettier
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

    // Validate the output (syntax validation)
    contextLogger.debug('Validating files', { files: Object.keys(prefixedFiles) });
    const validationResult = this.validationPipeline.validate(prefixedFiles);

    if (validationResult.warnings && validationResult.warnings.length > 0) {
      for (const warning of validationResult.warnings) {
        callbacks.onWarning?.({
          path: warning.filePath ?? '',
          message: warning.message,
          type: 'validation',
        });
        warningCount++;
      }
    }

    if (!validationResult.valid) {
      contextLogger.error('Validation errors', { errors: validationResult.errors });
      const error = 'AI output failed validation';
      callbacks.onError?.(error);
      return {
        success: false,
        error,
        validationErrors: validationResult.errors,
      };
    }

    // If aborted, skip build-fix and downstream work
    if (callbacks.signal?.aborted) {
      contextLogger.info('Generation aborted by client before build-fix loop');
      return {
        success: false,
        error: 'Generation cancelled by client',
      };
    }

    // Build validation with auto-retry using the injected bugfix provider
    const finalFiles = await this.runBuildFixLoop(
      validationResult.sanitizedOutput!,
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

    // Create project state
    const now = new Date();
    const projectId = uuidv4();
    const versionId = uuidv4();

    const projectState: ProjectState = {
      id: projectId,
      name: this.extractProjectName(description),
      description: description,
      files: finalFiles,
      createdAt: now,
      updatedAt: now,
      currentVersionId: versionId,
    };

    const version: Version = {
      id: versionId,
      projectId: projectId,
      prompt: description,
      timestamp: now,
      files: finalFiles,
      diffs: this.computeInitialDiffs(finalFiles),
      parentVersionId: null,
    };

    // Emit files with 'complete' status
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

    callbacks.onComplete?.({ projectState, version });

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
export async function createStreamingProjectGenerator(): Promise<StreamingProjectGenerator> {
  const [pipeline, bugfixProvider, providerName] = await Promise.all([
    createGenerationPipeline(),
    createAIProvider('bugfix'),
    getEffectiveProvider(),
  ]);
  const promptProvider = createPromptProvider(providerName);
  return new StreamingProjectGenerator(pipeline, bugfixProvider, promptProvider);
}
