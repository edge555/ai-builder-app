import type { RepairAttempt, ImageAttachment } from '@ai-app-builder/shared/types';
import type { ConversationTurn } from '@ai-app-builder/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChatMessage } from '../components/ChatInterface';
import { useProjectState, useProjectActions, useChatMessages, useGenerationActions, useToastActions } from '../context';
import { toStoredProject } from '../services/storage';
import { storageService } from '../services/storage';
import { getUserFriendlyErrorMessage, detectErrorType, isRetryableError, extractRetryAfterSeconds, type ErrorType } from '../utils/error-messages';
import { createLogger } from '../utils/logger';

const DEFAULT_RATE_LIMIT_WAIT_MS = 30_000;

const submitLogger = createLogger('SubmitPrompt');

const MAX_API_RETRIES = 3;

const MAX_CONVERSATION_TURNS = 5;
const MAX_CONVERSATION_CHARS = 6000;

/**
 * Build a condensed conversation history from recent chat messages.
 * Filters to user+assistant pairs, truncates content, and respects a char budget.
 * Note: stops adding turns once the budget is exceeded — later (smaller) turns are dropped.
 */
export function buildConversationHistory(
    messages: ChatMessage[],
    maxTurns: number = MAX_CONVERSATION_TURNS,
    maxChars: number = MAX_CONVERSATION_CHARS
): ConversationTurn[] {
    // Filter to user and assistant messages (exclude errors)
    const relevant = messages.filter(m => !m.isError && (m.role === 'user' || m.role === 'assistant'));

    // Take last N*2 messages (N pairs)
    const recentMessages = relevant.slice(-(maxTurns * 2));

    const turns: ConversationTurn[] = [];
    let totalChars = 0;

    for (const msg of recentMessages) {
        const turn: ConversationTurn = {
            role: msg.role,
            content: msg.content.slice(0, 500),
        };

        if (msg.role === 'assistant' && msg.changeSummary) {
            turn.changeSummary = {
                description: (msg.changeSummary.description ?? '').slice(0, 300),
                affectedFiles: (msg.changeSummary.affectedFiles ?? []).slice(0, 20),
            };
        }

        const turnChars = turn.content.length + (turn.changeSummary?.description.length ?? 0);
        if (totalChars + turnChars > maxChars) break;
        totalChars += turnChars;
        turns.push(turn);
    }

    return turns;
}

/**
 * Hook to handle high-level orchestration for submitting prompts.
 * This replaces the logic previously held in the legacy ChatContext.
 * Now includes API-level retry logic with failure history accumulation.
 */
export function useSubmitPrompt() {
    const { projectState } = useProjectState();
    const { setProjectState, undo: projectUndo, redo: projectRedo } = useProjectActions();
    const chatMessages = useChatMessages();
    const generation = useGenerationActions();
    const { addToast } = useToastActions();

    const isSubmittingRef = useRef(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const apiRetryHistoryRef = useRef<RepairAttempt[]>([]);
    const submitAbortRef = useRef<AbortController | null>(null);

    // Warn user before closing tab during generation
    useEffect(() => {
        if (!isGenerating) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isGenerating]);

    /**
     * Shows a countdown toast for rate limit errors and waits the required time.
     */
    const waitForRateLimit = useCallback(async (errorMsg: string, signal: AbortSignal): Promise<void> => {
        const waitMs = (extractRetryAfterSeconds(errorMsg) ?? DEFAULT_RATE_LIMIT_WAIT_MS / 1000) * 1000;
        addToast({
            type: 'warning',
            message: 'Rate limited — waiting to retry',
            countdown: { endsAt: Date.now() + waitMs },
            autoDismissMs: waitMs + 500,
        });
        await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, waitMs);
            signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); });
        });
    }, [addToast]);

    /**
     * Returns a random success message for project generation.
     */
    const getGenerationSuccessMessage = useCallback((projectName: string, fileCount: number): string => {
        const messages = [
            `I've generated the project "${projectName}" with ${fileCount} files. You can now preview and edit the code.`,
            `The "${projectName}" scaffold has been created successfully (${fileCount} files generated).`,
            `Project "${projectName}" is ready. I've structured ${fileCount} files according to your requirements.`,
            `Successfully generated ${fileCount} files for "${projectName}". Let me know if you need any adjustments.`,
            `Generation complete for "${projectName}". You can find the file structure in the solution explorer.`,
        ];
        return messages[Math.floor(Math.random() * messages.length)];
    }, []);

    /**
     * Returns a random success message for modifications.
     */
    const getModificationSuccessMessage = useCallback((description?: string): string => {
        const defaultMessages = [
            "I've applied the requested modifications to your project.",
            "Changes have been successfully integrated into the codebase.",
            "The project has been updated based on your recent request.",
            "Modifications complete. You can review the changes in the diff viewer.",
            "Updates have been applied. The project has been rebuilt to reflect your changes.",
        ];
        return description || defaultMessages[Math.floor(Math.random() * defaultMessages.length)];
    }, []);

    /**
     * Submits a prompt to the AI, either generating a new project or modifying an existing one.
     * Includes API-level retry logic with failure history accumulation.
     */
    const submitPrompt = useCallback(async (prompt: string, attachments?: ImageAttachment[]): Promise<void> => {
        // Abort any in-flight request to prevent duplicate generation
        if (isSubmittingRef.current && submitAbortRef.current) {
            submitAbortRef.current.abort();
            generation.abortCurrentRequest();
        }

        const abortController = new AbortController();
        submitAbortRef.current = abortController;
        isSubmittingRef.current = true;
        setIsGenerating(true);
        generation.clearError();
        generation.setIsLoading(true);

        // Store the user message reference (state updates are async)
        const userMessage = chatMessages.addUserMessage(prompt);

        // Reset retry history for new request
        apiRetryHistoryRef.current = [];
        let retryCount = 0;

        try {
            if (!projectState) {
                // No project exists, generate a new one using streaming with retry
                generation.setLoadingPhase('generating');

                while (retryCount < MAX_API_RETRIES) {
                    if (abortController.signal.aborted) break;
                    retryCount++;

                    // Show retry message if not first attempt
                    if (retryCount > 1) {
                        chatMessages.addAssistantMessage(
                            `🔄 Retrying generation (${retryCount}/${MAX_API_RETRIES})...`
                        );
                    }

                    const operationStartMs = Date.now();
                    const result = await generation.generateProjectStreaming(prompt, attachments);
                    if (abortController.signal.aborted) break;

                    generation.setLoadingPhase('validating');
                    if (result.success && result.projectState) {
                        const uniqueProjectName = await storageService.getUniqueProjectName(result.projectState.name);
                        const projectStateWithUniqueName = {
                            ...result.projectState,
                            name: uniqueProjectName,
                        };

                        setProjectState(projectStateWithUniqueName, false);

                        const fileCount = Object.keys(projectStateWithUniqueName.files).length;
                        const successMessage = getGenerationSuccessMessage(projectStateWithUniqueName.name, fileCount);

                        // Create assistant message and store reference
                        const assistantMessage = chatMessages.addAssistantMessage(successMessage, undefined, undefined, Date.now() - operationStartMs);

                        // Immediately save to storage with complete message history
                        // Build from current state + the two messages we just added (state hasn't updated yet)
                        try {
                            const completeMessages = [...chatMessages.messages, userMessage, assistantMessage];
                            const storedProject = toStoredProject(projectStateWithUniqueName, completeMessages);
                            await storageService.saveProject(storedProject);
                            await storageService.setMetadata('lastOpenedProjectId', projectStateWithUniqueName.id);
                        } catch (saveError) {
                            submitLogger.error('Failed to save project after generation', { error: saveError });
                            // Continue anyway - auto-save will retry
                        }

                        // Success - clear retry history
                        apiRetryHistoryRef.current = [];
                        break;
                    } else {
                        // Record failure
                        const errorMsg = result.error || 'Failed to generate project';
                        const errorType = (result.errorType as ErrorType | undefined) ?? detectErrorType(errorMsg);

                        // Don't show error message for user-initiated cancellation
                        if (errorType === 'cancelled') {
                            break;
                        }

                        apiRetryHistoryRef.current.push({
                            attempt: retryCount,
                            error: errorMsg,
                            strategy: `Attempted to generate project with prompt: ${prompt.slice(0, 100)}...`,
                            timestamp: new Date().toISOString(),
                        });

                        // If this was the last retry or error is not retryable, show error
                        if (retryCount >= MAX_API_RETRIES || !isRetryableError(errorType)) {
                            const errorText = getUserFriendlyErrorMessage({
                                errorType,
                                originalMessage: errorMsg,
                                qualityReport: result.qualityReport,
                            });
                            const finalMsg = retryCount >= MAX_API_RETRIES
                                ? `Sorry, I couldn't generate the project after ${MAX_API_RETRIES} attempts. ${errorText}`
                                : errorText;
                            chatMessages.addErrorMessage(finalMsg, prompt);
                            if (!isRetryableError(errorType)) {
                                break; // Stop retrying non-retryable errors
                            }
                        } else if (errorType === 'rate_limit') {
                            await waitForRateLimit(errorMsg, abortController.signal);
                        }
                        // Otherwise continue to next retry
                    }
                }
            } else {
                // Project exists, modify it with retry
                generation.setLoadingPhase('modifying');

                while (retryCount < MAX_API_RETRIES) {
                    if (abortController.signal.aborted) break;
                    retryCount++;

                    // Show retry message if not first attempt
                    if (retryCount > 1) {
                        chatMessages.addAssistantMessage(
                            `🔄 Retrying modification (${retryCount}/${MAX_API_RETRIES})...`
                        );
                    }

                    const conversationHistory = buildConversationHistory(chatMessages.messages);
                    const operationStartMs = Date.now();
                    const result = await generation.modifyProject(projectState, prompt, undefined, { conversationHistory, attachments });
                    if (abortController.signal.aborted) break;

                    generation.setLoadingPhase('validating');
                    if (result.success && result.projectState) {
                        setProjectState(result.projectState, true); // Save to undo stack
                        chatMessages.addAssistantMessage(
                            getModificationSuccessMessage(result.changeSummary?.description),
                            result.changeSummary,
                            result.diffs,
                            Date.now() - operationStartMs
                        );
                        // Success - clear retry history
                        apiRetryHistoryRef.current = [];
                        break;
                    } else {
                        // Record failure
                        const errorMsg = result.error || 'Failed to modify project';
                        const errorType = (result.errorType as ErrorType | undefined) ?? detectErrorType(errorMsg);

                        // Don't show error message for user-initiated cancellation
                        if (errorType === 'cancelled') {
                            break;
                        }

                        apiRetryHistoryRef.current.push({
                            attempt: retryCount,
                            error: errorMsg,
                            strategy: `Attempted to modify project with prompt: ${prompt.slice(0, 100)}...`,
                            timestamp: new Date().toISOString(),
                        });

                        // If this was the last retry or error is not retryable, show error
                        if (retryCount >= MAX_API_RETRIES || !isRetryableError(errorType)) {
                            const errorText = getUserFriendlyErrorMessage({
                                errorType,
                                originalMessage: errorMsg,
                                qualityReport: result.qualityReport,
                            });
                            const finalMsg = retryCount >= MAX_API_RETRIES
                                ? `Sorry, I couldn't make those changes after ${MAX_API_RETRIES} attempts. ${errorText}`
                                : errorText;
                            chatMessages.addErrorMessage(finalMsg, prompt);
                            if (!isRetryableError(errorType)) {
                                break; // Stop retrying non-retryable errors
                            }
                        } else if (errorType === 'rate_limit') {
                            await waitForRateLimit(errorMsg, abortController.signal);
                        }
                        // Otherwise continue to next retry
                    }
                }
            }
        } catch (error) {
            // Don't show errors for aborted/superseded requests
            if (abortController.signal.aborted) return;

            // Network/timeout/auth errors - don't retry these
            const errorMsg = error instanceof Error ? error.message : 'An unexpected error occurred';
            const errorType = detectErrorType(errorMsg);

            // Don't show error message for user-initiated cancellation
            if (errorType !== 'cancelled') {
                const errorText = getUserFriendlyErrorMessage({
                    errorType,
                    originalMessage: errorMsg,
                });
                chatMessages.addErrorMessage(`Sorry, something went wrong: ${errorText}`, prompt);
            }
        } finally {
            // Only clean up if this is still the active request (not superseded by a new one)
            if (submitAbortRef.current === abortController) {
                generation.setIsLoading(false);
                generation.setLoadingPhase('idle');
                isSubmittingRef.current = false;
                setIsGenerating(false);
                submitAbortRef.current = null;
            }
        }
    }, [
        projectState,
        setProjectState,
        chatMessages,
        generation,
        getGenerationSuccessMessage,
        getModificationSuccessMessage,
        waitForRateLimit,
    ]);

    /**
     * Undo wrapper that adds an assistant message.
     */
    const undo = useCallback(() => {
        projectUndo();
        chatMessages.addAssistantMessage('↩️ Reverted to previous state');
    }, [projectUndo, chatMessages]);

    /**
     * Redo wrapper that adds an assistant message.
     */
    const redo = useCallback(() => {
        projectRedo();
        chatMessages.addAssistantMessage('↪️ Restored undone changes');
    }, [projectRedo, chatMessages]);

    return {
        submitPrompt,
        undo,
        redo,
        isSubmitting: isSubmittingRef.current,
        abortCurrentRequest: generation.abortCurrentRequest,
    };
}
