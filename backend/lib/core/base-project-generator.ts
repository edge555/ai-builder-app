/**
 * Base Project Generator
 * Contains shared functionality between ProjectGenerator and StreamingProjectGenerator.
 */

import type { FileDiff, RepairAttempt } from '@ai-app-builder/shared';
import type { AIProvider } from '../ai';
import type { IPromptProvider } from './prompts/prompt-provider';
import { ValidationPipeline } from './validation-pipeline';
import { BuildValidator, createBuildValidator } from './build-validator';
import { PROJECT_OUTPUT_SCHEMA } from './prompts/generation-prompt-utils';
import { ProjectOutputSchema } from './schemas';
import { processFiles } from './file-processor';
import { createLogger } from '../logger';
import { createAcceptanceGate } from './acceptance-gate';
import { parseStructuredOutput } from '../ai/structured-output';

const logger = createLogger('BaseProjectGenerator');

/**
 * Abstract base class for project generators.
 * Contains shared logic for both streaming and non-streaming generation.
 */
export abstract class BaseProjectGenerator {
    protected readonly bugfixProvider: AIProvider;
    protected readonly promptProvider: IPromptProvider;
    protected readonly validationPipeline: ValidationPipeline;
    protected readonly buildValidator: BuildValidator;
    protected readonly acceptanceGate = createAcceptanceGate();
    protected readonly maxBuildRetries = 3;

    constructor(bugfixProvider: AIProvider, promptProvider: IPromptProvider) {
        this.bugfixProvider = bugfixProvider;
        this.promptProvider = promptProvider;
        this.validationPipeline = new ValidationPipeline();
        this.buildValidator = createBuildValidator();
    }

    /**
     * Extracts a project name from the description.
     */
    protected extractProjectName(description: string): string {
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
     * Universal build-fix retry loop using the injected bugfix provider and prompt provider.
     * Runs build validation and retries with the AI if errors are found,
     * accumulating previous failure context to help the AI avoid repeating mistakes.
     *
     * @param files - The files to validate and potentially fix
     * @param originalPrompt - The original user prompt/description
     * @param requestId - Optional request ID for log correlation
     * @returns The fixed files, or the original files if all retries fail
     */
    protected async runBuildFixLoop(
        files: Record<string, string>,
        originalPrompt: string,
        requestId?: string
    ): Promise<Record<string, string>> {
        const contextLogger = requestId ? logger.withRequestId(requestId) : logger;
        let currentFiles = files;
        let acceptanceResult = this.acceptanceGate.validate(currentFiles);
        let buildRetryCount = 0;
        const failureHistory: RepairAttempt[] = [];

        while (!acceptanceResult.valid && buildRetryCount < this.maxBuildRetries) {
            const buildErrors = acceptanceResult.buildErrors;
            const fixableErrors = buildErrors.filter(e => e.severity === 'fixable');
            const unfixableErrors = buildErrors.filter(e => e.severity === 'unfixable');

            if (buildErrors.length === 0) {
                contextLogger.warn('Acceptance gate failed before build-fix loop on non-build validation issues', {
                    issues: acceptanceResult.issues,
                });
                break;
            }

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
                errors: buildErrors.map(e => e.message),
            });

            const errorContext = this.buildValidator.formatErrorsForAI(buildErrors);

            // Convert RepairAttempt[] to string[] for getBugfixSystemPrompt
            const failureHistoryStrings = failureHistory.map(a =>
                a.strategy ? `${a.error}: ${a.strategy}` : a.error
            );

            const fixSystemInstruction = this.promptProvider.getBugfixSystemPrompt(
                errorContext,
                failureHistoryStrings
            );

            contextLogger.info('Sending build fix request to bugfix provider', {
                attempt: buildRetryCount,
                systemInstructionLength: fixSystemInstruction.length,
                errorCount: buildErrors.length,
                hasFailureHistory: failureHistory.length > 0,
            });

            const fixResponse = await this.bugfixProvider.generate({
                prompt: `Fix the build errors. Original project description: "${originalPrompt}"`,
                systemInstruction: fixSystemInstruction,
                temperature: 0.5,
                maxOutputTokens: this.promptProvider.tokenBudgets.bugfix,
                responseSchema: PROJECT_OUTPUT_SCHEMA,
                requestId,
            });

            contextLogger.info('Received fix response from bugfix provider', {
                success: fixResponse.success,
                contentLength: fixResponse.content?.length ?? 0,
                hasError: !!fixResponse.error,
            });

            if (!fixResponse.success || !fixResponse.content) {
                contextLogger.error('Failed to get fix response from bugfix provider');
                failureHistory.push({
                    attempt: buildRetryCount,
                    error: fixResponse.error || 'AI failed to generate fix',
                    strategy: `AI generation failed when asked to fix: ${buildResult.errors.map(e => e.message).join('; ')}`,
                    timestamp: new Date().toISOString(),
                });
                continue;
            }

            try {
                const parsedResult = parseStructuredOutput(fixResponse.content, ProjectOutputSchema, 'ProjectOutput');
                if (!parsedResult.success) {
                    contextLogger.error('Structured parsing failed on fix response', {
                        error: parsedResult.error,
                    });
                    failureHistory.push({
                        attempt: buildRetryCount,
                        error: parsedResult.error,
                        strategy: 'Attempted to fix build errors but returned invalid schema',
                        timestamp: new Date().toISOString(),
                    });
                    continue;
                }

                const fixedOutput = parsedResult.data;
                const processResult = await processFiles(fixedOutput.files || [], { addFrontendPrefix: false });
                const fixedFiles = processResult.files;

                const revalidation = this.acceptanceGate.validate(fixedFiles);
                if (!revalidation.valid || !revalidation.sanitizedOutput) {
                    contextLogger.error('Fixed code failed acceptance validation', {
                        issues: revalidation.issues,
                    });
                    failureHistory.push({
                        attempt: buildRetryCount,
                        error: `Acceptance validation failed: ${revalidation.issues.map(e => e.message).join(', ')}`,
                        strategy: 'Attempted to fix build errors but returned code that still failed acceptance',
                        timestamp: new Date().toISOString(),
                    });
                    continue;
                }

                currentFiles = revalidation.sanitizedOutput;
                const previousErrors = buildErrors.map(e => e.message).join('; ');
                acceptanceResult = this.acceptanceGate.validate(currentFiles);

                if (acceptanceResult.valid) {
                    contextLogger.info('Build errors fixed successfully');
                } else {
                    failureHistory.push({
                        attempt: buildRetryCount,
                        error: acceptanceResult.issues.map(e => e.message).join('; '),
                        strategy: `Tried to fix: ${previousErrors}`,
                        timestamp: new Date().toISOString(),
                    });
                }
            } catch (parseError) {
                contextLogger.error('Failed to parse fix response', { error: parseError instanceof Error ? parseError.message : 'Unknown error' });
                failureHistory.push({
                    attempt: buildRetryCount,
                    error: parseError instanceof Error ? parseError.message : 'Unknown parsing error',
                    strategy: `AI returned unparseable response when asked to fix: ${buildResult.errors.map(e => e.message).join('; ')}`,
                    timestamp: new Date().toISOString(),
                });
                continue;
            }
        }

        if (!acceptanceResult.valid) {
            contextLogger.warn('Build warnings after retries', {
                errors: acceptanceResult.issues,
                totalAttempts: buildRetryCount,
            });
        }

        return currentFiles;
    }
}
