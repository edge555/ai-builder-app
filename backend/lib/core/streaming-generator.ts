/**
 * Streaming Project Generator
 * Generates projects with incremental file streaming via SSE.
 */

import { v4 as uuidv4 } from 'uuid';
import type { ProjectState, Version, OperationResult } from '@ai-app-builder/shared/types';
import { GeminiClient } from '../ai';
import { getGenerationPrompt, PROJECT_OUTPUT_SCHEMA } from './prompts/generation-prompt';
import { buildFixPrompt } from './prompts/build-fix-prompt';
import { processFiles } from './file-processor';
import { ProjectOutputSchema } from './schemas';
import { createLogger } from '../logger';
import { MAX_OUTPUT_TOKENS_GENERATION } from '../constants';
import { parseIncrementalFiles, estimateTotalFiles } from '../utils/incremental-json-parser';
import { BaseProjectGenerator } from './base-project-generator';

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
 */
export class StreamingProjectGenerator extends BaseProjectGenerator {
  constructor(geminiClient?: GeminiClient) {
    super(geminiClient);
  }

  /**
   * Generates a project with streaming file emission.
   */
  async generateProjectStreaming(
    description: string,
    callbacks: StreamingCallbacks
  ): Promise<StreamingGenerationResult> {
    if (!description || description.trim() === '') {
      return {
        success: false,
        error: 'Project description is required',
      };
    }

    logger.debug('Starting streaming project generation', {
      descriptionLength: description.length,
    });

    callbacks.onStart?.();

    // Build prompt with proper injection defense
    const systemInstruction = getGenerationPrompt(description);

    logger.info('Sending streaming request to Gemini', {
      systemInstructionLength: systemInstruction.length,
      temperature: 0.7,
      maxOutputTokens: MAX_OUTPUT_TOKENS_GENERATION,
    });

    // Track parsed files to emit them incrementally
    let lastParsedIndex = 0;
    let accumulatedText = '';
    const emittedFiles = new Set<string>();
    let warningCount = 0;

    // Call Gemini API with structured output and streaming
    const response = await this.geminiClient.generateStreaming({
      prompt: 'Generate the project based on the user request in the system instruction.',
      systemInstruction: systemInstruction,
      temperature: 0.7,
      maxOutputTokens: MAX_OUTPUT_TOKENS_GENERATION,
      responseSchema: PROJECT_OUTPUT_SCHEMA,
      signal: callbacks.signal,
      onChunk: (chunk: string, accumulatedLength: number) => {
        accumulatedText += chunk;
        callbacks.onProgress?.(accumulatedLength);

        // Try to parse incrementally for complete file objects
        const parseResult = parseIncrementalFiles(accumulatedText, lastParsedIndex);

        if (parseResult.files.length > 0) {
          const totalEstimate = estimateTotalFiles(accumulatedText);

          // Emit newly parsed files with 'partial' status during streaming
          for (const file of parseResult.files) {
            if (!emittedFiles.has(file.path)) {
              emittedFiles.add(file.path);
              callbacks.onFile?.({
                path: file.path,
                content: file.content,
                index: emittedFiles.size - 1,
                total: totalEstimate,
                status: 'partial', // Mark as partial during streaming
              });
            }
          }

          lastParsedIndex = parseResult.lastParsedIndex;
        }
      },
    });

    if (!response.success || !response.content) {
      const error = response.error ?? 'Failed to generate project from AI';
      callbacks.onError?.(error, {
        errorCode: response.errorCode,
        errorType: response.errorType,
        partialContent: response.partialContent,
      });
      // Emit stream-end even on error to indicate partial files
      callbacks.onStreamEnd?.({
        totalFiles: emittedFiles.size,
        successfulFiles: 0,
        failedFiles: emittedFiles.size,
        warnings: warningCount,
      });
      return {
        success: false,
        error,
      };
    }

    // Parse and validate the complete structured output
    let parsedData: unknown;
    try {
      parsedData = JSON.parse(response.content);
    } catch (e) {
      const error = `Failed to parse AI response: ${e instanceof Error ? e.message : 'Invalid JSON'}`;
      callbacks.onError?.(error);
      return {
        success: false,
        error,
      };
    }

    const zodResult = ProjectOutputSchema.safeParse(parsedData);

    if (!zodResult.success) {
      const error = `Invalid AI response structure: ${zodResult.error.message}`;
      callbacks.onError?.(error);
      return {
        success: false,
        error,
      };
    }

    const parsedOutput = zodResult.data;
    const files = parsedOutput.files;

    // Process files: sanitize paths, normalize newlines, format with Prettier
    const processResult = await processFiles(files, { addFrontendPrefix: false });
    const prefixedFiles = processResult.files;

    // Emit warnings for formatting failures
    for (const warning of processResult.warnings) {
      callbacks.onWarning?.({
        path: warning.path,
        message: warning.message,
        type: warning.type,
      });
      warningCount++;
    }

    // Validate the output (syntax validation)
    logger.debug('Validating files', { files: Object.keys(prefixedFiles) });
    const validationResult = this.validationPipeline.validate(prefixedFiles);

    if (!validationResult.valid) {
      logger.error('Validation errors', { errors: validationResult.errors });
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
      logger.info('Generation aborted by client before build-fix loop');
      return {
        success: false,
        error: 'Generation cancelled by client',
      };
    }

    // Build validation with auto-retry using universal retry loop
    const finalFiles = await this.runBuildFixLoop(
      validationResult.sanitizedOutput!,
      'generation',
      description
    );

    // If aborted after build-fix, skip file emission
    if (callbacks.signal?.aborted) {
      logger.info('Generation aborted by client after build-fix loop');
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

    // Emit files one by one with 'complete' status
    const fileEntries = Object.entries(finalFiles);
    for (let i = 0; i < fileEntries.length; i++) {
      const [path, content] = fileEntries[i];
      callbacks.onFile?.({
        path,
        content,
        index: i,
        total: fileEntries.length,
        status: 'complete', // Mark as complete after processing
      });
    }

    callbacks.onComplete?.({ projectState, version });

    // Emit stream-end summary
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
 * Creates a StreamingProjectGenerator instance.
 */
export function createStreamingProjectGenerator(): StreamingProjectGenerator {
  return new StreamingProjectGenerator();
}
