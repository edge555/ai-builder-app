/**
 * Project Generator Service
 * Generates complete project structures from natural language descriptions.
 */

import { v4 as uuidv4 } from 'uuid';
import type { ProjectState, Version, OperationResult } from '@ai-app-builder/shared';
import type { AIProvider } from '../ai';
import { createAIProvider } from '../ai';
import type { IPromptProvider } from './prompts/prompt-provider';
import { createPromptProvider } from './prompts/prompt-provider-factory';
import { getEffectiveProvider } from '../ai/provider-config-store';
import { PROJECT_OUTPUT_SCHEMA } from './prompts/generation-prompt-utils';
import { createLogger } from '../logger';
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
  private readonly executionProvider: AIProvider;

  constructor(executionProvider: AIProvider, bugfixProvider: AIProvider, promptProvider: IPromptProvider) {
    super(bugfixProvider, promptProvider);
    this.executionProvider = executionProvider;
  }

  /**
   * Generates a complete project from a natural language description.
   */
  async generateProject(description: string, options?: { requestId?: string }): Promise<GenerationResult> {
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

    const systemInstruction = this.promptProvider.getExecutionGenerationSystemPrompt(description, null, null);

    logger.info('Sending request to AI provider', {
      systemInstructionLength: systemInstruction.length,
      temperature: 0.7,
      maxOutputTokens: this.promptProvider.tokenBudgets.executionGeneration,
    });

    const response = await this.executionProvider.generate({
      prompt: 'Generate the project based on the user request in the system instruction.',
      systemInstruction,
      temperature: 0.7,
      maxOutputTokens: this.promptProvider.tokenBudgets.executionGeneration,
      responseSchema: PROJECT_OUTPUT_SCHEMA,
    });

    logger.info('Received response from AI provider', {
      success: response.success,
      contentLength: response.content?.length ?? 0,
      hasError: !!response.error,
      retryCount: response.retryCount,
    });

    if (!response.success || !response.content) {
      logger.error('AI provider error', { error: response.error });
      return {
        success: false,
        error: response.error ?? 'Failed to generate project from AI',
      };
    }

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

    for (const file of files) {
      if (!isSafePath(file.path)) {
        logger.error('Unsafe file path detected', { path: file.path });
        return {
          success: false,
          error: `Unsafe file path detected: ${file.path}`,
        };
      }
    }

    const processResult = await processFiles(files, { addFrontendPrefix: false });
    const prefixedFiles = processResult.files;

    if (processResult.warnings.length > 0) {
      logger.warn('File processing warnings', {
        count: processResult.warnings.length,
        warnings: processResult.warnings,
      });
    }

    logger.debug('Validating files', { files: Object.keys(prefixedFiles) });
    const validationResult = this.validationPipeline.validate(prefixedFiles);
    if (!validationResult.valid) {
      logger.error('Validation errors', { errors: validationResult.errors });
      return {
        success: false,
        error: 'AI output failed validation',
        validationErrors: validationResult.errors,
      };
    }

    const finalFiles = await this.runBuildFixLoop(
      validationResult.sanitizedOutput!,
      description
    );

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

    return {
      success: true,
      projectState,
      version,
    };
  }
}

/**
 * Creates a ProjectGenerator with execution + bugfix providers and the appropriate prompt provider.
 */
export async function createProjectGenerator(): Promise<ProjectGenerator> {
  const [executionProvider, bugfixProvider, providerName] = await Promise.all([
    createAIProvider('execution'),
    createAIProvider('bugfix'),
    getEffectiveProvider(),
  ]);
  const promptProvider = createPromptProvider(providerName);
  return new ProjectGenerator(executionProvider, bugfixProvider, promptProvider);
}
