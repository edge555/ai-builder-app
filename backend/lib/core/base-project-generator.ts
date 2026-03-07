/**
 * Base Project Generator
 * Contains shared functionality between ProjectGenerator and StreamingProjectGenerator.
 */

import type { FileDiff, RepairAttempt } from '@ai-app-builder/shared';
import type { AIProvider } from '../ai';
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

    constructor(aiProvider: AIProvider) {
        this.aiProvider = aiProvider;
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
        originalPrompt: string,
        requestId?: string
    ): Promise<Record<string, string>> {
        const contextLogger = requestId ? logger.withRequestId(requestId) : logger;
        let currentFiles = files;
        let buildResult = this.buildValidator.validate(currentFiles);
        let buildRetryCount = 0;
        const failureHistory: RepairAttempt[] = [];

        while (!buildResult.valid && buildRetryCount < this.maxBuildRetries) {
            // Early termination: skip retries if all errors are unfixable (e.g. Node.js built-ins)
            const fixableErrors = buildResult.errors.filter(e => e.severity === 'fixable');
            const unfixableErrors = buildResult.errors.filter(e => e.severity === 'unfixable');

            if (unfixableErrors.length > 0 && fixableErrors.length === 0) {
                contextLogger.warn('All build errors are unfixable, skipping retry loop', {
                    unfixableErrors: unfixableErrors.map(e => ({ message: e.message, file: e.file })),
                });
                break;
            }

            if (unfixableErrors.length > 0) {
                contextLogger.warn('Some build errors are unfixable and will persist after retries', {
                    unfixableErrors: unfixableErrors.map(e => ({ message: e.message, file: e.file })),
                });
            }

            buildRetryCount++;
            contextLogger.info('Build validation retry', {
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

            contextLogger.info('Sending build fix request to AI provider', {
                attempt: buildRetryCount,
                systemInstructionLength: fixSystemInstruction.length,
                errorCount: buildResult.errors.length,
                hasFailureHistory: failureHistory.length > 0,
            });
            contextLogger.debug('AI provider fix request details', {
                systemInstruction: fixSystemInstruction,
            });

            // Request AI to fix the errors
            const fixResponse = await this.aiProvider.generate({
                prompt: 'Generate the fixed project based on the error context in the system instruction.',
                systemInstruction: fixSystemInstruction,
                temperature: 0.5,
                maxOutputTokens: getMaxOutputTokens(mode),
                responseSchema: PROJECT_OUTPUT_SCHEMA,
                requestId,
            });

            contextLogger.info('Received fix response from AI provider', {
                success: fixResponse.success,
                contentLength: fixResponse.content?.length ?? 0,
                hasError: !!fixResponse.error,
            });
            contextLogger.debug('AI provider fix response content', {
                content: fixResponse.content,
                error: fixResponse.error,
            });

            if (!fixResponse.success || !fixResponse.content) {
                contextLogger.error('Failed to get fix response from AI');
                // Record this failure
                failureHistory.push({
                    attempt: buildRetryCount,
                    error: fixResponse.error || 'AI failed to generate fix',
                    strategy: `AI generation failed when asked to fix: ${buildResult.errors.map(e => e.message).join('; ')}`,
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
                    contextLogger.error('Zod validation failed on fix response', {
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
                    contextLogger.error('Fixed code failed syntax validation');
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
                    contextLogger.info('Build errors fixed successfully');
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
                contextLogger.error('Failed to parse fix response', { error: e instanceof Error ? e.message : 'Unknown error' });
                // Record this failure
                failureHistory.push({
                    attempt: buildRetryCount,
                    error: e instanceof Error ? e.message : 'Unknown parsing error',
                    strategy: `AI returned unparseable response when asked to fix: ${buildResult.errors.map(e => e.message).join('; ')}`,
                    timestamp: new Date().toISOString(),
                });
                break;
            }
        }

        // Log if there are still build errors after retries
        if (!buildResult.valid) {
            contextLogger.warn('Build warnings after retries', {
                errors: buildResult.errors.map(e => ({ message: e.message, file: e.file })),
                totalAttempts: buildRetryCount,
            });
        }

        return currentFiles;
    }
}

