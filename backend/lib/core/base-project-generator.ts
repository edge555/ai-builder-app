/**
 * Base Project Generator
 * Contains shared functionality between ProjectGenerator and StreamingProjectGenerator.
 */

import type { FileDiff, RepairAttempt } from '@ai-app-builder/shared';
import type { AIProvider } from '../ai';
import { createAIProvider } from '../ai';
import { ValidationPipeline } from './validation-pipeline';
import { BuildValidator, createBuildValidator } from './build-validator';
import { buildFixPrompt, type BuildFixMode } from './prompts/build-fix-prompt';
import { getGenerationPrompt, PROJECT_OUTPUT_SCHEMA } from './prompts/generation-prompt';
import { ProjectOutputSchema } from './schemas';
import { processFiles } from './file-processor';
import { getMaxOutputTokens } from '../config';
import { createLogger } from '../logger';

const logger = createLogger('BaseProjectGenerator');

/**
 * Abstract base class for project generators.
 * Contains shared logic for both streaming and non-streaming generation.
 */
export abstract class BaseProjectGenerator {
    protected readonly aiProvider: AIProvider;
    protected readonly validationPipeline: ValidationPipeline;
    protected readonly buildValidator: BuildValidator;
    protected readonly maxBuildRetries = 3;

    constructor(aiProvider?: AIProvider) {
        this.aiProvider = aiProvider ?? createAIProvider();
        this.validationPipeline = new ValidationPipeline();
        this.buildValidator = createBuildValidator();
    }

    /**
     * Extracts a project name from the description.
     */
    protected extractProjectName(description: string): string {
        // Take first few words, clean up, and use as name
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
    protected computeInitialDiffs(files: Record<string, string>): FileDiff[] {
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

    /**
     * Universal build-fix retry loop with failure history accumulation.
     * Runs build validation and retries with the AI if errors are found,
     * accumulating previous failure context to help the AI avoid repeating mistakes.
     * 
     * @param files - The files to validate and potentially fix
     * @param mode - Whether this is for 'generation' or 'modification'
     * @param originalPrompt - The original user prompt/description
     * @returns The fixed files, or the original files if all retries fail
     */
    protected async runBuildFixLoop(
        files: Record<string, string>,
        mode: BuildFixMode,
        originalPrompt: string
    ): Promise<Record<string, string>> {
        let currentFiles = files;
        let buildResult = this.buildValidator.validate(currentFiles);
        let buildRetryCount = 0;
        const failureHistory: RepairAttempt[] = [];

        while (!buildResult.valid && buildRetryCount < this.maxBuildRetries) {
            buildRetryCount++;
            logger.info('Build validation retry', {
                attempt: buildRetryCount,
                maxRetries: this.maxBuildRetries,
                errors: buildResult.errors.map(e => e.message),
            });

            // Format errors for AI
            const errorContext = this.buildValidator.formatErrorsForAI(buildResult.errors);

            // Build fix prompt with failure history
            const fixPromptContent = buildFixPrompt({
                mode,
                errorContext,
                originalPrompt,
                failureHistory: failureHistory.length > 0 ? failureHistory : undefined,
            });

            const fixSystemInstruction = getGenerationPrompt(fixPromptContent) +
                '\n\nIMPORTANT: You must fix ALL the build errors listed above. Make sure to either add missing dependencies to package.json OR use native alternatives.';

            logger.info('Sending build fix request to AI provider', {
                attempt: buildRetryCount,
                systemInstructionLength: fixSystemInstruction.length,
                errorCount: buildResult.errors.length,
                hasFailureHistory: failureHistory.length > 0,
            });
            logger.debug('AI provider fix request details', {
                systemInstruction: fixSystemInstruction,
            });

            // Request AI to fix the errors
            const fixResponse = await this.aiProvider.generate({
                prompt: 'Generate the fixed project based on the error context in the system instruction.',
                systemInstruction: fixSystemInstruction,
                temperature: 0.5,
                maxOutputTokens: getMaxOutputTokens('modification'),
                responseSchema: PROJECT_OUTPUT_SCHEMA,
            });

            logger.info('Received fix response from AI provider', {
                success: fixResponse.success,
                contentLength: fixResponse.content?.length ?? 0,
                hasError: !!fixResponse.error,
            });
            logger.debug('AI provider fix response content', {
                content: fixResponse.content,
                error: fixResponse.error,
            });

            if (!fixResponse.success || !fixResponse.content) {
                logger.error('Failed to get fix response from AI');
                // Record this failure
                failureHistory.push({
                    attempt: buildRetryCount,
                    error: fixResponse.error || 'AI failed to generate fix',
                    timestamp: new Date().toISOString(),
                });
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
                    // Record this failure
                    failureHistory.push({
                        attempt: buildRetryCount,
                        error: `Schema validation failed: ${zodResult.error.message}`,
                        strategy: 'Attempted to fix build errors but returned invalid schema',
                        timestamp: new Date().toISOString(),
                    });
                    break;
                }

                const fixedOutput = zodResult.data;
                // Process fixed files
                const processResult = await processFiles(fixedOutput.files || [], { addFrontendPrefix: false });
                const fixedFiles = processResult.files;

                // Re-validate syntax
                const revalidation = this.validationPipeline.validate(fixedFiles);
                if (!revalidation.valid) {
                    logger.error('Fixed code failed syntax validation');
                    // Record this failure
                    failureHistory.push({
                        attempt: buildRetryCount,
                        error: `Syntax validation failed: ${revalidation.errors.map(e => e.message).join(', ')}`,
                        strategy: 'Attempted to fix build errors but introduced syntax errors',
                        timestamp: new Date().toISOString(),
                    });
                    break;
                }

                // Re-run build validation
                currentFiles = revalidation.sanitizedOutput!;
                const previousErrors = buildResult.errors.map(e => e.message).join('; ');
                buildResult = this.buildValidator.validate(currentFiles);

                if (buildResult.valid) {
                    logger.info('Build errors fixed successfully');
                } else {
                    // Record this failure for next iteration
                    failureHistory.push({
                        attempt: buildRetryCount,
                        error: buildResult.errors.map(e => e.message).join('; '),
                        strategy: `Tried to fix: ${previousErrors}`,
                        timestamp: new Date().toISOString(),
                    });
                }
            } catch (e) {
                logger.error('Failed to parse fix response', { error: e instanceof Error ? e.message : 'Unknown error' });
                // Record this failure
                failureHistory.push({
                    attempt: buildRetryCount,
                    error: e instanceof Error ? e.message : 'Unknown parsing error',
                    timestamp: new Date().toISOString(),
                });
                break;
            }
        }

        // Log if there are still build errors after retries
        if (!buildResult.valid) {
            logger.warn('Build warnings after retries', {
                errors: buildResult.errors.map(e => ({ message: e.message, file: e.file })),
                totalAttempts: buildRetryCount,
            });
        }

        return currentFiles;
    }
}

