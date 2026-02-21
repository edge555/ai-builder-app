/**
 * Modification Engine Service
 * 
 * Orchestrates context-aware code modifications by:
 * 1. Classifying user intent
 * 2. Selecting relevant code slices
 * 3. Sending only relevant context to Gemini
 * 4. Validating and applying changes
 * 
 * Requirements: 3.5, 4.6, 4.7
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ProjectState,
  Version,
  RepairAttempt,
  ModificationResult,
} from '@ai-app-builder/shared';
import type { CodeSlice } from '../analysis/file-planner/types';
import type { AIProvider } from '../ai';
import { createAIProviderWithModel } from '../ai';
import { ValidationPipeline } from '../core/validation-pipeline';
import { BuildValidator, createBuildValidator } from '../core/build-validator';
import { getModificationPrompt, MODIFICATION_OUTPUT_SCHEMA } from './prompts/modification-prompt';
import { formatCode } from '../prettier-config';
import { createLogger } from '../logger';
import { config } from '../config';
import { getMaxOutputTokens } from '../config';
import {
  FilePlanner,
  createFilePlanner,
} from '../analysis';
import { ModificationOutputSchema } from '../core/schemas';
import { isSafePath } from '../utils';
import { buildFixPrompt } from '../core/prompts/build-fix-prompt';
import { applyEdits } from './edit-applicator';
import { computeDiffs, createModifiedFileDiff } from './diff-computer';
import { createChangeSummary } from './change-summarizer';
import { buildModificationPrompt, buildSlicesFromFiles } from './prompt-builder';

const logger = createLogger('ModificationEngine');

/**
 * Modification Engine service for modifying existing projects.
 * Includes build validation with auto-retry.
 */
export class ModificationEngine {
  private readonly aiProvider: AIProvider;
  private readonly validationPipeline: ValidationPipeline;
  private readonly filePlanner: FilePlanner;
  private readonly buildValidator: BuildValidator;
  private readonly maxBuildRetries = 2;

  constructor(aiProvider?: AIProvider) {
    // Modification requires the most capable model (Pro or specialized Flash) for complex instruction following and code generation
    this.aiProvider = aiProvider ?? createAIProviderWithModel(config.ai.hardModel);
    this.validationPipeline = new ValidationPipeline();
    this.filePlanner = createFilePlanner(this.aiProvider);
    this.buildValidator = createBuildValidator();
  }


  /**
   * Modify an existing project based on a user prompt.
   * @param projectState - The current project state with files
   * @param prompt - The modification prompt
   * @param options - Optional configuration (e.g., skipPlanning to bypass FilePlanner)
   */
  async modifyProject(
    projectState: ProjectState,
    prompt: string,
    options?: { skipPlanning?: boolean }
  ): Promise<ModificationResult> {
    if (!prompt || prompt.trim() === '') {
      return {
        success: false,
        error: 'Modification prompt is required',
      };
    }

    if (!projectState || Object.keys(projectState.files).length === 0) {
      return {
        success: false,
        error: 'Project state with files is required',
      };
    }

    try {
      // Step 1: Select code slices and determine category
      const { slices, category } = await this.selectCodeSlices(projectState, prompt, options?.skipPlanning);

      // Step 2: Determine if design system should be included based on category
      const includeDesignSystem = category === 'ui' || category === 'style' || category === 'mixed';
      logger.debug('System instruction determined', { category, includeDesignSystem });

      // Step 3: Generate modifications with retry logic
      const modificationResult = await this.generateModifications(
        prompt,
        slices,
        projectState,
        includeDesignSystem
      );

      if (!modificationResult.success || !modificationResult.updatedFiles || !modificationResult.deletedFiles) {
        return {
          success: false,
          error: modificationResult.error ?? 'Modification failed with incomplete output',
        };
      }

      const { updatedFiles, deletedFiles } = modificationResult;
      const validationResult = await this.validateModifiedFiles(updatedFiles);
      if (!validationResult.valid) {
        return {
          success: false,
          error: 'AI output failed validation',
          validationErrors: validationResult.errors,
        };
      }

      // Step 5: Build validation with auto-retry
      const buildValidationResult = await this.validateAndFixBuild(
        projectState,
        updatedFiles,
        prompt,
        slices,
        includeDesignSystem
      );

      // Use the potentially updated files from build validation
      const finalUpdatedFiles = buildValidationResult.updatedFiles;

      // Step 6: Create final result with updated project state and metadata
      return await this.createResult(projectState, finalUpdatedFiles, deletedFiles, prompt);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during modification',
      };
    }
  }

  /**
   * Select code slices based on user prompt and planning strategy.
   */
  private async selectCodeSlices(
    projectState: ProjectState,
    prompt: string,
    skipPlanning?: boolean
  ): Promise<{ slices: CodeSlice[]; category: 'ui' | 'logic' | 'style' | 'mixed' }> {
    let slices: CodeSlice[];
    let category: 'ui' | 'logic' | 'style' | 'mixed' = 'mixed';

    if (skipPlanning) {
      // When skipPlanning is true, treat all provided files as primary files
      // Build slices directly without calling FilePlanner
      slices = buildSlicesFromFiles(projectState);
      logger.info('Skipping FilePlanner, using all files as primary', {
        fileCount: slices.length
      });
    } else {
      // Use FilePlanner to select relevant code slices and determine category
      // FilePlanner replaces IntentClassifier + SliceSelector with AI-powered file selection
      const planResult = await this.filePlanner.planWithCategory(prompt, projectState);
      slices = planResult.slices;
      category = planResult.category ?? 'mixed';
      logger.info('FilePlanner result', {
        sliceCount: slices.length,
        category,
      });
    }

    return { slices, category };
  }

  /**
   * Generate modifications with retry logic for edit failures.
   */
  private async generateModifications(
    prompt: string,
    slices: CodeSlice[],
    projectState: ProjectState,
    includeDesignSystem: boolean
  ): Promise<{
    success: boolean;
    error?: string;
    updatedFiles?: Record<string, string | null>;
    deletedFiles?: string[];
  }> {
    const contextPrompt = buildModificationPrompt(prompt, slices, projectState);

    // Retry configuration
    const MAX_RETRIES = 3;
    let attempt = 0;
    let lastEditError: string | null = null;
    let updatedFiles: Record<string, string | null> = {};
    let deletedFiles: string[] = [];

    while (attempt <= MAX_RETRIES) {
      attempt++;
      logger.info('Modification attempt', { attempt, maxAttempts: MAX_RETRIES + 1 });

      // Build prompt with error feedback if this is a retry
      let userRequest = prompt;
      if (lastEditError) {
        userRequest += `\n\n[PREVIOUS ATTEMPT FAILED]\nError: ${lastEditError}\n\nPlease fix your edit. Make sure the "search" string EXACTLY matches the existing code (including whitespace and newlines). Try using a smaller, more unique search pattern.`;
      }

      // Build system instruction with proper injection defense
      const systemInstruction = getModificationPrompt(userRequest, includeDesignSystem);
      const fullPrompt = contextPrompt;

      // Log what we're sending to Gemini
      logger.info('Sending modification request to Gemini', {
        attempt,
        promptLength: fullPrompt.length,
        systemInstructionLength: systemInstruction.length,
        temperature: 0.7,
        isRetry: !!lastEditError,
        includeDesignSystem,
      });
      logger.debug('Gemini modification request details', {
        prompt: fullPrompt,
        systemInstruction: systemInstruction,
        responseSchema: MODIFICATION_OUTPUT_SCHEMA,
      });

      // Call Gemini API with structured output
      const response = await this.aiProvider.generate({
        prompt: fullPrompt,
        systemInstruction: systemInstruction,
        temperature: 0.7,
        maxOutputTokens: getMaxOutputTokens('modification'),
        responseSchema: MODIFICATION_OUTPUT_SCHEMA,
      });

      // Log what we received from Gemini
      logger.info('Received modification response from Gemini', {
        success: response.success,
        contentLength: response.content?.length ?? 0,
        hasError: !!response.error,
      });
      logger.debug('Gemini modification response content', {
        content: response.content,
        error: response.error,
      });

      if (!response.success || !response.content) {
        logger.error('Gemini error', { error: response.error });
        lastEditError = response.error ?? 'Failed to get modification from AI';
        logger.info('Retrying due to AI error', { error: lastEditError });
        continue;
      }

      logger.debug('AI Response content preview', { contentLength: response.content.length });

      // Parse and validate the structured output
      let parsedData: unknown;
      try {
        parsedData = JSON.parse(response.content);
      } catch (e) {
        logger.error('Failed to parse AI output as JSON', {
          error: e instanceof Error ? e.message : String(e),
        });
        lastEditError = `Failed to parse AI response: ${e instanceof Error ? e.message : 'Invalid JSON'}`;
        logger.info('Retrying due to JSON parse error', { error: lastEditError });
        continue;
      }

      const zodResult = ModificationOutputSchema.safeParse(parsedData);
      if (!zodResult.success) {
        logger.error('Zod validation failed on modification response', {
          errors: zodResult.error.issues,
        });
        lastEditError = `Schema validation failed: ${zodResult.error.message}`;
        logger.info('Retrying due to schema validation error', { error: lastEditError });
        continue;
      }

      const parsedOutput = zodResult.data;

      // Extract files from the structured response
      const aiFilesArray = parsedOutput.files;
      logger.debug('Processing file edits', { fileCount: aiFilesArray?.length ?? 0 });
      if (!aiFilesArray || !Array.isArray(aiFilesArray)) {
        logger.error('AI response missing files array');
        lastEditError = 'AI response missing files array';
        logger.info('Retrying due to missing files array', { error: lastEditError });
        continue;
      }

      // Validate all file paths for security
      let hasUnsafePath = false;
      for (const fileEdit of aiFilesArray) {
        if (fileEdit.path && !isSafePath(fileEdit.path)) {
          logger.error('Unsafe file path detected', { path: fileEdit.path });
          lastEditError = `Unsafe file path detected: ${fileEdit.path}`;
          hasUnsafePath = true;
          break;
        }
      }

      if (hasUnsafePath) {
        logger.info('Retrying due to unsafe file path', { error: lastEditError });
        continue;
      }

      // Apply the modifications
      updatedFiles = {};
      deletedFiles = [];
      let editFailed = false;
      lastEditError = null;

      for (const fileEdit of aiFilesArray) {
        if (!fileEdit.path) {
          logger.warn('Skipping file entry without path');
          continue;
        }

        // Sanitize path: remove any accidental spaces
        fileEdit.path = fileEdit.path.replace(/\s+/g, '');

        switch (fileEdit.operation) {
          case 'delete':
            deletedFiles.push(fileEdit.path);
            updatedFiles[fileEdit.path] = null;
            break;

          case 'create':
            if (!fileEdit.content) {
              logger.warn('Create operation missing content', { path: fileEdit.path });
              continue;
            }
            let createContent = fileEdit.content;
            // Normalize newlines and tabs
            if (createContent.includes('\\n')) createContent = createContent.replace(/\\n/g, '\n');
            if (createContent.includes('\\t')) createContent = createContent.replace(/\\t/g, '\t');
            // Format with Prettier
            try {
              createContent = await formatCode(createContent, fileEdit.path);
            } catch (e) {
              logger.warn('Failed to format file', { path: fileEdit.path, error: e instanceof Error ? e.message : 'Unknown error' });
            }
            updatedFiles[fileEdit.path] = createContent;
            break;

          case 'modify':
            if (!fileEdit.edits || fileEdit.edits.length === 0) {
              logger.warn('Modify operation missing edits', { path: fileEdit.path });
              continue;
            }
            const originalContent = projectState.files[fileEdit.path];
            if (originalContent === undefined) {
              logger.warn('Cannot modify non-existent file', { path: fileEdit.path });
              continue;
            }
            // Apply the edits
            const editResult = applyEdits(originalContent, fileEdit.edits);
            if (!editResult.success) {
              logger.warn('Failed to apply edits', { path: fileEdit.path, error: editResult.error });
              lastEditError = `File: ${fileEdit.path} - ${editResult.error}`;
              editFailed = true;
              break;
            }
            // Format the modified content
            let modifiedContent = editResult.content!;
            try {
              modifiedContent = await formatCode(modifiedContent, fileEdit.path);
            } catch (e) {
              logger.warn('Failed to format file', { path: fileEdit.path, error: e instanceof Error ? e.message : 'Unknown error' });
            }
            updatedFiles[fileEdit.path] = modifiedContent;
            break;

          default:
            logger.warn('Unknown operation type', { path: (fileEdit as any).path });
        }

        if (editFailed) break;
      }

      // If edits succeeded, break out of retry loop
      if (!editFailed) {
        logger.info('Modification succeeded', { attempt });
        return { success: true, updatedFiles, deletedFiles };
      }

      // If we've exhausted retries, return error
      if (attempt > MAX_RETRIES) {
        return {
          success: false,
          error: `Failed after ${MAX_RETRIES + 1} attempts. Last error: ${lastEditError}`,
        };
      }

      logger.info('Retrying due to error', { error: lastEditError });
    }

    return { success: false, error: 'Unexpected error in modification loop' };
  }

  /**
   * Validate modified files using the validation pipeline.
   */
  private async validateModifiedFiles(
    updatedFiles: Record<string, string | null>
  ): Promise<{ valid: boolean; errors: any[] }> {
    const filesToValidate: Record<string, string> = {};
    for (const [path, content] of Object.entries(updatedFiles)) {
      if (content !== null) {
        filesToValidate[path] = content;
      }
    }

    return this.validationPipeline.validate(filesToValidate);
  }

  /**
   * Validate build and attempt to fix errors with AI.
   */
  private async validateAndFixBuild(
    projectState: ProjectState,
    updatedFiles: Record<string, string | null>,
    prompt: string,
    slices: CodeSlice[],
    includeDesignSystem: boolean
  ): Promise<{ updatedFiles: Record<string, string | null> }> {
    // Create a temporary view of what the project will look like
    const tempFiles = { ...projectState.files };
    for (const [path, content] of Object.entries(updatedFiles)) {
      if (content === null) {
        delete tempFiles[path];
      } else {
        tempFiles[path] = content;
      }
    }

    // Run build validation with failure history accumulation
    let buildResult = this.buildValidator.validate(tempFiles);
    let buildRetryCount = 0;
    const buildFailureHistory: RepairAttempt[] = [];
    const mutableUpdatedFiles = { ...updatedFiles };

    while (!buildResult.valid && buildRetryCount < this.maxBuildRetries) {
      buildRetryCount++;
      logger.info('Modification build retry', {
        attempt: buildRetryCount,
        maxRetries: this.maxBuildRetries,
        errors: buildResult.errors.map(e => e.message),
        hasFailureHistory: buildFailureHistory.length > 0,
      });

      // Format errors for AI
      const errorContext = this.buildValidator.formatErrorsForAI(buildResult.errors);

      // Request AI to fix the errors with failure history
      const fixUserRequest = buildFixPrompt({
        mode: 'modification',
        errorContext,
        originalPrompt: prompt,
        failureHistory: buildFailureHistory.length > 0 ? buildFailureHistory : undefined,
      });
      const fixSystemInstruction = getModificationPrompt(fixUserRequest, includeDesignSystem) + '\n\nIMPORTANT: Fix ALL build errors. Adding missing dependencies to package.json is usually the solution.';
      const fixContextPrompt = buildModificationPrompt(fixUserRequest, slices, projectState);

      const fixResponse = await this.aiProvider.generate({
        prompt: fixContextPrompt,
        systemInstruction: fixSystemInstruction,
        temperature: 0.5,
        maxOutputTokens: getMaxOutputTokens('modification'),
        responseSchema: MODIFICATION_OUTPUT_SCHEMA,
      });

      if (!fixResponse.success || !fixResponse.content) {
        logger.error('Failed to get fix response from AI');
        // Record this failure
        buildFailureHistory.push({
          attempt: buildRetryCount,
          error: fixResponse.error || 'AI failed to generate fix',
          timestamp: new Date().toISOString(),
        });
        break;
      }

      // Parse and process the fix
      try {
        if (typeof fixResponse.content !== 'string') {
          throw new Error('Fix response content is missing');
        }

        // With responseSchema, Gemini returns guaranteed valid JSON
        let parsedFixData: unknown;
        try {
          parsedFixData = JSON.parse(fixResponse.content);
        } catch (parseError) {
          logger.error('Failed to parse fix response JSON', {
            error: parseError instanceof Error ? parseError.message : String(parseError),
          });
          // Record this failure
          buildFailureHistory.push({
            attempt: buildRetryCount,
            error: parseError instanceof Error ? parseError.message : 'JSON parse error',
            strategy: 'Attempted to fix build errors but returned invalid JSON',
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        // Validate with Zod schema
        const fixZodResult = ModificationOutputSchema.safeParse(parsedFixData);
        if (!fixZodResult.success) {
          logger.error('Fix response failed Zod validation', {
            errors: fixZodResult.error.issues,
          });
          // Record this failure
          buildFailureHistory.push({
            attempt: buildRetryCount,
            error: `Schema validation failed: ${fixZodResult.error.message}`,
            strategy: 'Attempted to fix build errors but returned invalid schema',
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        const fixOutput = fixZodResult.data;
        if (!fixOutput.files || !Array.isArray(fixOutput.files)) {
          // Record this failure
          buildFailureHistory.push({
            attempt: buildRetryCount,
            error: 'Fix response missing files array',
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        // Apply fixes to our updatedFiles map
        for (const fileEdit of fixOutput.files) {
          if (fileEdit.operation === 'modify' && fileEdit.edits) {
            // We need to apply edits to the content in tempFiles (which has previous mods applied)
            const currentContent = tempFiles[fileEdit.path];
            if (currentContent) {
              const editResult = applyEdits(currentContent, fileEdit.edits);
              if (editResult.success) {
                mutableUpdatedFiles[fileEdit.path] = editResult.content!; // Update the modifications map
                tempFiles[fileEdit.path] = editResult.content!;    // Update temp view
              }
            }
          } else if (fileEdit.operation === 'create' && fileEdit.content) {
            mutableUpdatedFiles[fileEdit.path] = fileEdit.content;
            tempFiles[fileEdit.path] = fileEdit.content;
          }
        }

        // Re-validate
        const previousErrors = buildResult.errors.map(e => e.message).join('; ');
        buildResult = this.buildValidator.validate(tempFiles);
        if (buildResult.valid) {
          logger.info('Modification build errors fixed successfully');
        } else {
          // Record this failure for next iteration
          buildFailureHistory.push({
            attempt: buildRetryCount,
            error: buildResult.errors.map(e => e.message).join('; '),
            strategy: `Tried to fix: ${previousErrors}`,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (e) {
        logger.error('Error applying fixes', { error: e instanceof Error ? e.message : 'Unknown error' });
        // Record this failure
        buildFailureHistory.push({
          attempt: buildRetryCount,
          error: e instanceof Error ? e.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Log warning if still has errors
    if (!buildResult.valid) {
      logger.warn('Build warnings after retries', {
        errors: buildResult.errors.map(e => ({ message: e.message, file: e.file })),
      });
    }

    return { updatedFiles: mutableUpdatedFiles };
  }

  /**
   * Create final modification result with updated project state and metadata.
   */
  private async createResult(
    projectState: ProjectState,
    updatedFiles: Record<string, string | null>,
    deletedFiles: string[],
    prompt: string
  ): Promise<ModificationResult> {
    const now = new Date();
    const versionId = uuidv4();

    const newFiles = { ...projectState.files };

    // Apply modifications
    for (const [path, content] of Object.entries(updatedFiles)) {
      if (content === null) {
        delete newFiles[path];
      } else {
        newFiles[path] = content;
      }
    }

    const newProjectState: ProjectState = {
      ...projectState,
      files: newFiles,
      updatedAt: now,
      currentVersionId: versionId,
    };

    // Compute diffs
    const diffs = computeDiffs(projectState.files, newFiles, deletedFiles);

    // Create change summary
    const changeSummary = createChangeSummary(diffs, prompt);

    // Create new version
    const version: Version = {
      id: versionId,
      projectId: projectState.id,
      prompt: prompt,
      timestamp: now,
      files: newFiles,
      diffs: diffs,
      parentVersionId: projectState.currentVersionId,
    };

    return {
      success: true,
      projectState: newProjectState,
      version,
      diffs,
      changeSummary,
    };
  }



}

/**
 * Creates a ModificationEngine instance with default configuration.
 */
export function createModificationEngine(): ModificationEngine {
  return new ModificationEngine();
}
