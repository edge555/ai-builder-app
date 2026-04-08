import { buildRepairPrompt } from '@/utils/repair-prompt';

import type {
    RepairExecutionDependencies,
    RepairExecutionOptions,
    RepairExecutionResult,
    RepairFailureHistory,
} from './types';

const DEFAULT_MAX_ATTEMPTS = 5;

export interface RepairService {
    reset: () => void;
    runRepair: (options: RepairExecutionOptions) => Promise<RepairExecutionResult>;
}

export function createRepairService({
    errorAggregator,
    executeRepair,
    onAttemptStart,
    onAttemptFinish,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
}: RepairExecutionDependencies): RepairService {
    let attemptCount = 0;
    let inFlight = false;
    let lastRepairErrorKey: string | null = null;
    let failureHistory: RepairFailureHistory = [];

    const recordFailure = (attempt: number, errorMessage: string, strategy: string) => {
        failureHistory.push({
            attempt,
            error: errorMessage,
            strategy,
            timestamp: new Date().toISOString(),
        });
    };

    return {
        reset() {
            attemptCount = 0;
            inFlight = false;
            lastRepairErrorKey = null;
            failureHistory = [];
        },

        async runRepair({
            runtimeError,
            projectState,
            aggregatedErrors,
        }: RepairExecutionOptions): Promise<RepairExecutionResult> {
            const errorKey = `${runtimeError.message}:${runtimeError.filePath ?? ''}`;
            if (lastRepairErrorKey === errorKey || inFlight || !projectState || attemptCount >= maxAttempts) {
                return {
                    executed: false,
                    success: false,
                    attempt: attemptCount,
                };
            }

            inFlight = true;
            lastRepairErrorKey = errorKey;
            attemptCount += 1;
            const attempt = attemptCount;
            onAttemptStart?.(attempt);

            const repairPrompt = buildRepairPrompt(
                runtimeError,
                projectState.files,
                errorAggregator,
                failureHistory.length > 0 ? failureHistory : undefined
            );

            const affectedFiles = new Set<string>();
            if (runtimeError.filePath) {
                affectedFiles.add(runtimeError.filePath);
            }
            if (aggregatedErrors) {
                for (const error of aggregatedErrors.errors) {
                    if (error.filePath) {
                        affectedFiles.add(error.filePath);
                    }
                }
            }

            try {
                const result = await executeRepair({
                    prompt: repairPrompt,
                    runtimeError,
                    projectState,
                    options: {
                        shouldSkipPlanning: true,
                        repairAttempt: attempt,
                        errorContext: {
                            affectedFiles: Array.from(affectedFiles),
                            errorType: runtimeError.type,
                        },
                    },
                });

                const wasSuccessful = Boolean(
                    (result.success && result.projectState) ||
                    (result.partialSuccess && result.projectState)
                );

                if (wasSuccessful) {
                    failureHistory = [];
                    return {
                        executed: true,
                        success: true,
                        attempt,
                        partialSuccess: result.partialSuccess,
                        rolledBackFiles: result.rolledBackFiles,
                    };
                }

                recordFailure(
                    attempt,
                    result.error || 'Repair modification failed',
                    `Attempted to fix ${runtimeError.type}: ${runtimeError.message}`
                );

                return {
                    executed: true,
                    success: false,
                    attempt,
                    error: result.error,
                };
            } catch (error) {
                recordFailure(
                    attempt,
                    error instanceof Error ? error.message : 'Unknown error',
                    `Attempted to fix ${runtimeError.type}: ${runtimeError.message}`
                );

                return {
                    executed: true,
                    success: false,
                    attempt,
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            } finally {
                inFlight = false;
                lastRepairErrorKey = null;
                onAttemptFinish?.();
            }
        },
    };
}
