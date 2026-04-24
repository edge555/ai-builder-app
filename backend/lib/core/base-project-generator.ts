/**
 * Base Project Generator
 * Contains shared functionality for generation flows.
 */

import type {
    FileDiff,
    QualityIssue,
    RepairAttempt,
    RepairLevelReached,
} from '@ai-app-builder/shared';
import type { AIProvider } from '../ai';
import type { IPromptProvider } from './prompts/prompt-provider';
import type { IntentOutput } from './schemas';
import { ValidationPipeline } from './validation-pipeline';
import { BuildValidator, createBuildValidator } from './build-validator';
import { PROJECT_OUTPUT_SCHEMA } from './prompts/generation-prompt-utils';
import { ProjectOutputSchema } from './schemas';
import { processFiles } from './file-processor';
import { createLogger } from '../logger';
import { createAcceptanceGate } from './acceptance-gate';
import { getStructuredParseError, parseStructuredOutput } from '../ai/structured-output';
import { tryDeterministicFixes } from '../diff/deterministic-fixes';
import { evaluateProjectDelivery } from './project-delivery-gate';

const logger = createLogger('BaseProjectGenerator');

const TITLE_STOP_WORDS = new Set([
    'a', 'an', 'and', 'app', 'application', 'build', 'builder', 'create', 'dashboard',
    'for', 'generate', 'make', 'new', 'page', 'please', 'project', 'simple', 'site',
    'the', 'tool', 'website', 'with',
]);

const DESCRIPTOR_WORDS = [
    'Bright', 'Clever', 'Fresh', 'Modern', 'Quick', 'Sharp', 'Smart', 'Swift',
];

const SUFFIX_WORDS = [
    'Board', 'Desk', 'Forge', 'Hub', 'Lab', 'Studio', 'Works', 'Workshop',
];

const DOMAIN_KEYWORDS: Array<{ pattern: RegExp; word: string }> = [
    { pattern: /\bcalculator|calc|math|equation|arithmetic\b/i, word: 'Calc' },
    { pattern: /\bbudget|expense|finance|accounting|invoice\b/i, word: 'Budget' },
    { pattern: /\btodo|task|kanban|planner|productivity\b/i, word: 'Task' },
    { pattern: /\brecipe|meal|kitchen|food|restaurant\b/i, word: 'Recipe' },
    { pattern: /\bportfolio|resume|cv|showcase\b/i, word: 'Portfolio' },
    { pattern: /\bdashboard|analytics|metrics|report\b/i, word: 'Dashboard' },
    { pattern: /\bchat|message|messaging|conversation\b/i, word: 'Chat' },
    { pattern: /\bnote|notes|journal|writing|editor\b/i, word: 'Notes' },
    { pattern: /\bshop|store|commerce|product|catalog\b/i, word: 'Store' },
    { pattern: /\btravel|trip|itinerary|hotel|booking\b/i, word: 'Travel' },
    { pattern: /\bfitness|workout|health|gym|exercise\b/i, word: 'Fitness' },
    { pattern: /\bweather|forecast|climate\b/i, word: 'Weather' },
    { pattern: /\bquiz|exam|learning|course|education\b/i, word: 'Learning' },
    { pattern: /\bblog|article|content|cms\b/i, word: 'Content' },
];

/**
 * Abstract base class for project generators.
 * Contains shared logic for streaming generation and repair workflows.
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
    protected extractProjectName(description: string, intentOutput?: IntentOutput | null): string {
        const contextText = [
            intentOutput?.clarifiedGoal ?? '',
            ...(intentOutput?.features ?? []),
            description,
        ].join(' ');

        const domainWord = this.extractDomainWord(contextText);
        const seed = this.computeSeed(`${description}|${intentOutput?.clarifiedGoal ?? ''}|${(intentOutput?.features ?? []).join('|')}`);

        const descriptor = this.pickWord(DESCRIPTOR_WORDS, seed);
        const suffix = this.pickWord(SUFFIX_WORDS, seed + domainWord.length);

        return [descriptor, domainWord, suffix].join(' ');
    }

    private extractDomainWord(contextText: string): string {
        for (const keyword of DOMAIN_KEYWORDS) {
            if (keyword.pattern.test(contextText)) {
                return keyword.word;
            }
        }

        const tokens = this.extractCandidateTokens(contextText);
        if (tokens.length > 0) {
            return this.toTitleWord(tokens[0]);
        }

        return 'Project';
    }

    private extractCandidateTokens(text: string): string[] {
        const sanitized = text
            .replace(/[^a-zA-Z0-9\s]/g, ' ')
            .split(/\s+/)
            .map((token) => token.trim().toLowerCase())
            .filter((token) => token.length >= 3)
            .filter((token) => !TITLE_STOP_WORDS.has(token));

        return Array.from(new Set(sanitized.map((token) => this.toTitleWord(token))));
    }

    private toTitleWord(token: string): string {
        const cleaned = token.replace(/[^a-zA-Z0-9]/g, '');
        if (!cleaned) {
            return 'Project';
        }

        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
    }

    private computeSeed(value: string): number {
        let hash = 0;
        for (let i = 0; i < value.length; i++) {
            hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
        }
        return hash;
    }

    private pickWord(words: string[], seed: number): string {
        return words[seed % words.length];
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

    protected async repairGeneratedFilesToDeliveryApproval(
        files: Record<string, string>,
        originalPrompt: string,
        requestId?: string
    ): Promise<{
        files: Record<string, string>;
        repairAttempts: number;
        repairLevelReached: RepairLevelReached;
        finalEvaluation: import('./project-delivery-gate').DeliveryEvaluation;
    }> {
        const contextLogger = requestId ? logger.withRequestId(requestId) : logger;
        let currentFiles = files;
        let repairAttempts = 0;
        let repairLevelReached: RepairLevelReached = 'none';
        const failureHistory: RepairAttempt[] = [];

        let evaluation = evaluateProjectDelivery({
            files: currentFiles,
            acceptanceGate: this.acceptanceGate,
        });

        if (evaluation.approved) {
            return { files: currentFiles, repairAttempts, repairLevelReached, finalEvaluation: evaluation };
        }

        const fixableBuildErrors = evaluation.buildErrors
            .filter((error) => error.severity === 'fixable');

        if (fixableBuildErrors.length > 0) {
            const deterministic = tryDeterministicFixes(fixableBuildErrors, currentFiles);
            if (deterministic.fixed.length > 0) {
                currentFiles = { ...currentFiles, ...deterministic.fileChanges };
                repairAttempts++;
                repairLevelReached = 'deterministic';
                evaluation = evaluateProjectDelivery({
                    files: currentFiles,
                    acceptanceGate: this.acceptanceGate,
                });

                if (evaluation.approved) {
                    return { files: currentFiles, repairAttempts, repairLevelReached, finalEvaluation: evaluation };
                }

                failureHistory.push({
                    attempt: repairAttempts,
                    error: evaluation.issues.map((issue) => issue.message).join('; '),
                    strategy: 'Deterministic delivery repair',
                    timestamp: new Date().toISOString(),
                });
            }
        }

        const targetedAttempt = await this.requestGenerationRepair(
            currentFiles,
            originalPrompt,
            evaluation.issues,
            failureHistory,
            0.2,
            requestId,
        );

        if (targetedAttempt) {
            repairAttempts++;
            repairLevelReached = 'targeted-ai';
            currentFiles = targetedAttempt;
            evaluation = evaluateProjectDelivery({
                files: currentFiles,
                acceptanceGate: this.acceptanceGate,
            });

            if (evaluation.approved) {
                return { files: currentFiles, repairAttempts, repairLevelReached, finalEvaluation: evaluation };
            }

            failureHistory.push({
                attempt: repairAttempts,
                error: evaluation.issues.map((issue) => issue.message).join('; '),
                strategy: 'Targeted AI delivery repair',
                timestamp: new Date().toISOString(),
            });
        }

        const broadAttempt = await this.requestGenerationRepair(
            currentFiles,
            originalPrompt,
            evaluation.issues,
            failureHistory,
            0.4,
            requestId,
        );

        if (broadAttempt) {
            repairAttempts++;
            repairLevelReached = 'broad-ai';
            currentFiles = broadAttempt;
            evaluation = evaluateProjectDelivery({
                files: currentFiles,
                acceptanceGate: this.acceptanceGate,
            });

            if (evaluation.approved) {
                return { files: currentFiles, repairAttempts, repairLevelReached, finalEvaluation: evaluation };
            }
        }

        contextLogger.warn('Generation delivery repair exhausted', {
            repairAttempts,
            repairLevelReached,
            remainingIssues: evaluation.issues,
        });

        return { files: currentFiles, repairAttempts, repairLevelReached, finalEvaluation: evaluation };
    }

    protected formatDeliveryFailureMessage(qualityReport: {
        deliveryStage: string;
        issues: QualityIssue[];
    }): string {
        const issueSummary = qualityReport.issues.length > 0
            ? qualityReport.issues
                .map((issue) => `${issue.file ?? 'project'}: ${issue.message}`)
                .join('; ')
            : 'Unknown delivery failure';

        return `Project delivery failed during ${qualityReport.deliveryStage}: ${issueSummary}`;
    }

    private async requestGenerationRepair(
        files: Record<string, string>,
        originalPrompt: string,
        issues: QualityIssue[],
        failureHistory: RepairAttempt[],
        temperature: number,
        requestId?: string
    ): Promise<Record<string, string> | null> {
        const contextLogger = requestId ? logger.withRequestId(requestId) : logger;
        const errorContext = this.formatQualityIssuesForAI(issues);
        const failureHistoryStrings = failureHistory.map((attempt) =>
            attempt.strategy ? `${attempt.error}: ${attempt.strategy}` : attempt.error
        );
        const fixSystemInstruction = this.promptProvider.getBugfixSystemPrompt(
            errorContext,
            failureHistoryStrings
        );

        const fixResponse = await this.bugfixProvider.generate({
            prompt: `Fix the generated project so it passes delivery checks. Original project description: "${originalPrompt}"`,
            systemInstruction: fixSystemInstruction,
            temperature,
            maxOutputTokens: this.promptProvider.tokenBudgets.bugfix,
            responseSchema: PROJECT_OUTPUT_SCHEMA,
            requestId,
        });

        if (!fixResponse.success || !fixResponse.content) {
            contextLogger.warn('Generation delivery repair AI call failed', {
                temperature,
                error: fixResponse.error,
            });
            return null;
        }

        const parsedResult = parseStructuredOutput(fixResponse.content, ProjectOutputSchema, 'ProjectOutput');
        if (!parsedResult.success) {
            contextLogger.warn('Generation delivery repair returned invalid schema', {
                error: getStructuredParseError(parsedResult),
                temperature,
            });
            return null;
        }

        const processResult = await processFiles(parsedResult.data.files || [], { addFrontendPrefix: false });
        const repairedFiles = processResult.files;

        // Guard: reject repair response if it drastically reduces the file count (AI hallucination).
        // Allow up to 50% reduction — repair may legitimately remove files, but not most of the project.
        const originalCount = Object.keys(files).length;
        const repairedCount = Object.keys(repairedFiles).length;
        if (originalCount > 0 && repairedCount < Math.ceil(originalCount * 0.5)) {
            contextLogger.warn('Generation delivery repair returned too few files — rejecting', {
                originalCount,
                repairedCount,
                temperature,
            });
            return null;
        }

        return repairedFiles;
    }

    private formatQualityIssuesForAI(issues: QualityIssue[]): string {
        return issues
            .map((issue) => {
                const location = issue.file ? ` (${issue.file})` : '';
                return `[${issue.source}/${issue.type}]${location} ${issue.message}`;
            })
            .join('\n');
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
                    strategy: `AI generation failed when asked to fix: ${buildErrors.map(e => e.message).join('; ')}`,
                    timestamp: new Date().toISOString(),
                });
                continue;
            }

            try {
                const parsedResult = parseStructuredOutput(fixResponse.content, ProjectOutputSchema, 'ProjectOutput');
                if (!parsedResult.success) {
                    const parseError = getStructuredParseError(parsedResult);
                    contextLogger.error('Structured parsing failed on fix response', {
                        error: parseError,
                    });
                    failureHistory.push({
                        attempt: buildRetryCount,
                        error: parseError,
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
                    strategy: `AI returned unparseable response when asked to fix: ${buildErrors.map(e => e.message).join('; ')}`,
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
