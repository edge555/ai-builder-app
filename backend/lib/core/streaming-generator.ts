/**
 * Streaming Project Generator
 * Generates projects with incremental file streaming via SSE.
 */

import { v4 as uuidv4 } from 'uuid';
import type { ProjectState, Version, FileDiff } from '@ai-app-builder/shared';
import { GeminiClient, createGeminiClient } from '../ai';
import { ValidationPipeline } from './validation-pipeline';
import { BuildValidator, createBuildValidator } from './build-validator';
import { getGenerationPrompt, PROJECT_OUTPUT_SCHEMA } from './prompts/generation-prompt';
import { buildFixPrompt } from './prompts/build-fix-prompt';
import { processFiles } from './file-processor';
import { ProjectOutputSchema } from './schemas';
import { createLogger } from '../logger';
import { MAX_OUTPUT_TOKENS_GENERATION, MAX_OUTPUT_TOKENS_MODIFICATION } from '../constants';
import { parseIncrementalFiles, estimateTotalFiles } from '../utils/incremental-json-parser';

const logger = createLogger('StreamingGenerator');

/**
 * Callback for streaming events.
 */
export interface StreamingCallbacks {
  onStart?: () => void;
  onProgress?: (length: number) => void;
  onFile?: (data: { path: string; content: string; index: number; total: number }) => void;
  onComplete?: (result: { projectState: ProjectState; version: Version }) => void;
  onError?: (error: string) => void;
  onHeartbeat?: () => void;
}

/**
 * Result of streaming generation.
 */
export interface StreamingGenerationResult {
  success: boolean;
  projectState?: ProjectState;
  version?: Version;
  error?: string;
  validationErrors?: Array<{
    type: string;
    message: string;
    filePath?: string;
    line?: number;
  }>;
}

/**
 * Streaming Project Generator that emits files as they're generated.
 */
export class StreamingProjectGenerator {
  private readonly geminiClient: GeminiClient;
  private readonly validationPipeline: ValidationPipeline;
  private readonly buildValidator: BuildValidator;
  private readonly maxBuildRetries = 2;

  constructor(geminiClient?: GeminiClient) {
    this.geminiClient = geminiClient ?? createGeminiClient();
    this.validationPipeline = new ValidationPipeline();
    this.buildValidator = createBuildValidator();
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

    // Call Gemini API with structured output and streaming
    const response = await this.geminiClient.generateStreaming({
      prompt: 'Generate the project based on the user request in the system instruction.',
      systemInstruction: systemInstruction,
      temperature: 0.7,
      maxOutputTokens: MAX_OUTPUT_TOKENS_GENERATION,
      responseSchema: PROJECT_OUTPUT_SCHEMA,
      onChunk: (chunk: string, accumulatedLength: number) => {
        accumulatedText += chunk;
        callbacks.onProgress?.(accumulatedLength);
        
        // Try to parse incrementally for complete file objects
        const parseResult = parseIncrementalFiles(accumulatedText, lastParsedIndex);
        
        if (parseResult.files.length > 0) {
          const totalEstimate = estimateTotalFiles(accumulatedText);
          
          // Emit newly parsed files
          for (const file of parseResult.files) {
            if (!emittedFiles.has(file.path)) {
              emittedFiles.add(file.path);
              callbacks.onFile?.({
                path: file.path,
                content: file.content,
                index: emittedFiles.size - 1,
                total: totalEstimate,
              });
            }
          }
          
          lastParsedIndex = parseResult.lastParsedIndex;
        }
      },
    });

    if (!response.success || !response.content) {
      const error = response.error ?? 'Failed to generate project from AI';
      callbacks.onError?.(error);
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
    const prefixedFiles = await processFiles(files, { addFrontendPrefix: true });

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

    // Build validation with auto-retry
    let finalFiles = validationResult.sanitizedOutput!;
    let buildResult = this.buildValidator.validate(finalFiles);
    let buildRetryCount = 0;

    while (!buildResult.valid && buildRetryCount < this.maxBuildRetries) {
      buildRetryCount++;
      logger.info('Build validation retry', {
        attempt: buildRetryCount,
        maxRetries: this.maxBuildRetries,
      });

      const errorContext = this.buildValidator.formatErrorsForAI(buildResult.errors);
      const fixPromptContent = buildFixPrompt({
        mode: 'generation',
        errorContext,
        originalPrompt: description,
      });
      const fixSystemInstruction = getGenerationPrompt(fixPromptContent) + '\n\nIMPORTANT: You must fix ALL the build errors listed above.';

      const fixResponse = await this.geminiClient.generate({
        prompt: 'Generate the fixed project based on the error context in the system instruction.',
        systemInstruction: fixSystemInstruction,
        temperature: 0.5,
        maxOutputTokens: MAX_OUTPUT_TOKENS_MODIFICATION,
        responseSchema: PROJECT_OUTPUT_SCHEMA,
      });

      if (!fixResponse.success || !fixResponse.content) {
        logger.error('Failed to get fix response from AI');
        break;
      }

      try {
        const parsedData = JSON.parse(fixResponse.content);
        const zodResult = ProjectOutputSchema.safeParse(parsedData);

        if (!zodResult.success) {
          logger.error('Zod validation failed on fix response');
          break;
        }

        const fixedOutput = zodResult.data;
        const fixedFiles = await processFiles(fixedOutput.files || [], { addFrontendPrefix: true });

        const revalidation = this.validationPipeline.validate(fixedFiles);
        if (!revalidation.valid) {
          logger.error('Fixed code failed syntax validation');
          break;
        }

        finalFiles = revalidation.sanitizedOutput!;
        buildResult = this.buildValidator.validate(finalFiles);

        if (buildResult.valid) {
          logger.info('Build errors fixed successfully');
        }
      } catch (e) {
        logger.error('Failed to parse fix response');
        break;
      }
    }

    if (!buildResult.valid) {
      logger.warn('Build warnings after retries', {
        errors: buildResult.errors.map(e => ({ message: e.message, file: e.file })),
      });
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

    // Emit files one by one
    const fileEntries = Object.entries(finalFiles);
    for (let i = 0; i < fileEntries.length; i++) {
      const [path, content] = fileEntries[i];
      callbacks.onFile?.({
        path,
        content,
        index: i,
        total: fileEntries.length,
      });
    }

    callbacks.onComplete?.({ projectState, version });

    return {
      success: true,
      projectState,
      version,
    };
  }

  /**
   * Extracts a project name from the description.
   */
  private extractProjectName(description: string): string {
    const words = description
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 0)
      .slice(0, 3);

    if (words.length === 0) {
      return 'new-project';
    }

    return words.join('-').toLowerCase();
  }

  /**
   * Computes initial diffs for a new project (all files are "added").
   */
  private computeInitialDiffs(files: Record<string, string>): FileDiff[] {
    return Object.entries(files).map(([filePath, content]) => {
      const lines = content.split('\n');
      return {
        filePath,
        status: 'added' as const,
        hunks: [{
          oldStart: 0,
          oldLines: 0,
          newStart: 1,
          newLines: lines.length,
          changes: lines.map((line, index) => ({
            type: 'add' as const,
            lineNumber: index + 1,
            content: line,
          })),
        }],
      };
    });
  }
}

/**
 * Creates a StreamingProjectGenerator instance.
 */
export function createStreamingProjectGenerator(): StreamingProjectGenerator {
  return new StreamingProjectGenerator();
}
