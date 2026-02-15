/**
 * Project Generator Service
 * Generates complete project structures from natural language descriptions.
 * Implements Requirements 1.1, 1.2, 1.3
 */

import { v4 as uuidv4 } from 'uuid';
import type { ProjectState, Version, OperationResult } from '@ai-app-builder/shared';
import { GeminiClient } from '../ai';
import type { BuildError } from './build-validator';
import { getGenerationPrompt, PROJECT_OUTPUT_SCHEMA } from './prompts/generation-prompt';
import { buildFixPrompt } from './prompts/build-fix-prompt';
import { createLogger } from '../logger';
import { MAX_OUTPUT_TOKENS_GENERATION, MAX_OUTPUT_TOKENS_MODIFICATION } from '../constants';
import { processFiles } from './file-processor';
import { ProjectOutputSchema } from './schemas';
import { isSafePath } from '../utils';
import { BaseProjectGenerator } from './base-project-generator';

const logger = createLogger('ProjectGenerator');


/**
 * Result of project generation.
 * Alias for OperationResult from shared package.
 */
export type GenerationResult = OperationResult;

/**
 * Project Generator service for creating new projects from descriptions.
 * Includes build validation with auto-retry for fixing build errors.
 */
export class ProjectGenerator extends BaseProjectGenerator {
  constructor(geminiClient?: GeminiClient) {
    super(geminiClient);
  }

  /**
   * Generates a complete project from a natural language description.
   */
  async generateProject(description: string): Promise<GenerationResult> {
    if (!description || description.trim() === '') {
      return {
        success: false,
        error: 'Project description is required',
      };
    }

    logger.debug('Starting project generation', {
      descriptionLength: description.length,
      descriptionPreview: description.substring(0, 100),
    });

    // Build prompt with proper injection defense
    const systemInstruction = getGenerationPrompt(description);

    // Log what we're sending to Gemini
    logger.info('Sending request to Gemini', {
      systemInstructionLength: systemInstruction.length,
      temperature: 0.7,
      maxOutputTokens: MAX_OUTPUT_TOKENS_GENERATION,
    });
    logger.debug('Gemini request details', {
      systemInstruction: systemInstruction,
      responseSchema: PROJECT_OUTPUT_SCHEMA,
    });

    // Call Gemini API with structured output
    const response = await this.geminiClient.generate({
      prompt: 'Generate the project based on the user request in the system instruction.',
      systemInstruction: systemInstruction,
      temperature: 0.7,
      maxOutputTokens: MAX_OUTPUT_TOKENS_GENERATION,
      responseSchema: PROJECT_OUTPUT_SCHEMA,
    });

    // Log what we received from Gemini
    logger.info('Received response from Gemini', {
      success: response.success,
      contentLength: response.content?.length ?? 0,
      hasError: !!response.error,
      retryCount: response.retryCount,
    });
    logger.debug('Gemini response content', {
      content: response.content,
      error: response.error,
    });

    if (!response.success || !response.content) {
      logger.error('Gemini API error', { error: response.error });
      return {
        success: false,
        error: response.error ?? 'Failed to generate project from AI',
      };
    }

    // Step 6: Parse and validate the structured output
    // With responseSchema, Gemini returns guaranteed valid JSON
    let parsedData: unknown;
    try {
      parsedData = JSON.parse(response.content);
    } catch (e) {
      logger.error('Failed to parse AI output as JSON', {
        error: e instanceof Error ? e.message : String(e),
        content: response.content.substring(0, 500),
      });
      return {
        success: false,
        error: `Failed to parse AI response: ${e instanceof Error ? e.message : 'Invalid JSON'}`,
      };
    }

    const zodResult = ProjectOutputSchema.safeParse(parsedData);

    if (!zodResult.success) {
      logger.error('Zod validation failed', {
        errors: zodResult.error.issues,
        content: response.content.substring(0, 500),
      });
      return {
        success: false,
        error: `Invalid AI response structure: ${zodResult.error.message}`,
      };
    }

    const parsedOutput = zodResult.data;
    const files = parsedOutput.files;

    // Validate all file paths for security
    for (const file of files) {
      if (!isSafePath(file.path)) {
        logger.error('Unsafe file path detected', { path: file.path });
        return {
          success: false,
          error: `Unsafe file path detected: ${file.path}`,
        };
      }
    }

    // Process files: sanitize paths, normalize newlines, format with Prettier
    const processResult = await processFiles(files, { addFrontendPrefix: false });
    const prefixedFiles = processResult.files;

    // Log warnings if any
    if (processResult.warnings.length > 0) {
      logger.warn('File processing warnings', {
        count: processResult.warnings.length,
        warnings: processResult.warnings,
      });
    }

    // Validate the output (syntax validation)
    logger.debug('Validating files', { files: Object.keys(prefixedFiles) });
    const validationResult = this.validationPipeline.validate(prefixedFiles);
    logger.debug('Validation result', { valid: validationResult.valid });
    if (!validationResult.valid) {
      logger.error('Validation errors', { errors: validationResult.errors });
      return {
        success: false,
        error: 'AI output failed validation',
        validationErrors: validationResult.errors,
      };
    }


    // Build validation with auto-retry using universal retry loop
    const finalFiles = await this.runBuildFixLoop(
      validationResult.sanitizedOutput!,
      'generation',
      description
    );


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

    // Create initial version
    const version: Version = {
      id: versionId,
      projectId: projectId,
      prompt: description,
      timestamp: now,
      files: finalFiles,
      diffs: this.computeInitialDiffs(finalFiles),
      parentVersionId: null,
    };

    return {
      success: true,
      projectState,
      version,
    };
  }

}

/**
 * Creates a ProjectGenerator instance with default configuration.
 */
export function createProjectGenerator(): ProjectGenerator {
  return new ProjectGenerator();
}
