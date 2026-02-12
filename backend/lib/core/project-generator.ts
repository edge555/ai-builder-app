/**
 * Project Generator Service
 * Generates complete project structures from natural language descriptions.
 * Implements Requirements 1.1, 1.2, 1.3
 */

import { v4 as uuidv4 } from 'uuid';
import type { ProjectState, Version } from '@ai-app-builder/shared';
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
 */
export interface GenerationResult {
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
    const prefixedFiles = await processFiles(files, { addFrontendPrefix: true });

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

    // Build validation with auto-retry
    let finalFiles = validationResult.sanitizedOutput!;
    let buildResult = this.buildValidator.validate(finalFiles);
    let buildRetryCount = 0;

    while (!buildResult.valid && buildRetryCount < this.maxBuildRetries) {
      buildRetryCount++;
      logger.info('Build validation retry', {
        attempt: buildRetryCount,
        maxRetries: this.maxBuildRetries,
        errors: buildResult.errors.map(e => e.message),
      });

      // Format errors for AI
      const errorContext = this.buildValidator.formatErrorsForAI(buildResult.errors);

      const fixPromptContent = buildFixPrompt({
        mode: 'generation',
        errorContext,
        originalPrompt: description,
      });
      const fixSystemInstruction = getGenerationPrompt(fixPromptContent) + '\n\nIMPORTANT: You must fix ALL the build errors listed above. Make sure to either add missing dependencies to package.json OR use native alternatives.';

      // Log what we're sending to Gemini for fix
      logger.info('Sending build fix request to Gemini', {
        attempt: buildRetryCount,
        systemInstructionLength: fixSystemInstruction.length,
        errorCount: buildResult.errors.length,
      });
      logger.debug('Gemini fix request details', {
        systemInstruction: fixSystemInstruction,
      });

      // Request AI to fix the errors
      const fixResponse = await this.geminiClient.generate({
        prompt: 'Generate the fixed project based on the error context in the system instruction.',
        systemInstruction: fixSystemInstruction,
        temperature: 0.5,
        maxOutputTokens: MAX_OUTPUT_TOKENS_MODIFICATION,
        responseSchema: PROJECT_OUTPUT_SCHEMA,
      });

      // Log what we received from Gemini
      logger.info('Received fix response from Gemini', {
        success: fixResponse.success,
        contentLength: fixResponse.content?.length ?? 0,
        hasError: !!fixResponse.error,
      });
      logger.debug('Gemini fix response content', {
        content: fixResponse.content,
        error: fixResponse.error,
      });

      if (!fixResponse.success || !fixResponse.content) {
        logger.error('Failed to get fix response from AI');
        break;
      }

      // Parse and process the fixed output
      try {
        // With responseSchema, Gemini returns guaranteed valid JSON
        const parsedData = JSON.parse(fixResponse.content);
        const zodResult = ProjectOutputSchema.safeParse(parsedData);

        if (!zodResult.success) {
          logger.error('Zod validation failed on fix response', {
            errors: zodResult.error.issues,
          });
          break;
        }

        const fixedOutput = zodResult.data;
        // Process fixed files
        const fixedFiles = await processFiles(fixedOutput.files || [], { addFrontendPrefix: true });

        // Re-validate syntax
        const revalidation = this.validationPipeline.validate(fixedFiles);
        if (!revalidation.valid) {
          logger.error('Fixed code failed syntax validation');
          break;
        }

        // Re-run build validation
        finalFiles = revalidation.sanitizedOutput!;
        buildResult = this.buildValidator.validate(finalFiles);

        if (buildResult.valid) {
          logger.info('Build errors fixed successfully');
        }
      } catch (e) {
        logger.error('Failed to parse fix response', { error: e instanceof Error ? e.message : 'Unknown error' });
        break;
      }
    }

    // Log if there are still build errors after retries
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
