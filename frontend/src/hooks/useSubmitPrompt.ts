import { useCallback, useRef } from 'react';
import { useProject, useChatMessages, useGeneration } from '../context';
import type { RepairAttempt } from '@/shared';

const MAX_API_RETRIES = 3;

/**
 * Hook to handle high-level orchestration for submitting prompts.
 * This replaces the logic previously held in the legacy ChatContext.
 * Now includes API-level retry logic with failure history accumulation.
 */
export function useSubmitPrompt() {
    const project = useProject();
    const chatMessages = useChatMessages();
    const generation = useGeneration();

    const isSubmittingRef = useRef(false);
    const apiRetryHistoryRef = useRef<RepairAttempt[]>([]);

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
    const submitPrompt = useCallback(async (prompt: string): Promise<void> => {
        if (isSubmittingRef.current) {
            return;
        }
        isSubmittingRef.current = true;
        generation.clearError();
        generation.setIsLoading(true);
        chatMessages.addUserMessage(prompt);

        // Reset retry history for new request
        apiRetryHistoryRef.current = [];
        let retryCount = 0;

        try {
            if (!project.projectState) {
                // No project exists, generate a new one using streaming with retry
                generation.setLoadingPhase('generating');

                while (retryCount < MAX_API_RETRIES) {
                    retryCount++;

                    // Show retry message if not first attempt
                    if (retryCount > 1) {
                        chatMessages.addAssistantMessage(
                            `🔄 Retrying generation (${retryCount}/${MAX_API_RETRIES})...`
                        );
                    }

                    const result = await generation.generateProjectStreaming(prompt);

                    generation.setLoadingPhase('validating');
                    if (result.success && result.projectState) {
                        project.setProjectState(result.projectState, false);
                        const fileCount = Object.keys(result.projectState.files).length;
                        chatMessages.addAssistantMessage(
                            getGenerationSuccessMessage(result.projectState.name, fileCount)
                        );
                        // Success - clear retry history
                        apiRetryHistoryRef.current = [];
                        break;
                    } else {
                        // Record failure
                        const errorMsg = result.error || 'Failed to generate project';
                        apiRetryHistoryRef.current.push({
                            attempt: retryCount,
                            error: errorMsg,
                            strategy: `Attempted to generate project with prompt: ${prompt.slice(0, 100)}...`,
                            timestamp: new Date().toISOString(),
                        });

                        // If this was the last retry, show error
                        if (retryCount >= MAX_API_RETRIES) {
                            chatMessages.addAssistantMessage(`Sorry, I couldn't generate the project after ${MAX_API_RETRIES} attempts: ${errorMsg}`);
                        }
                        // Otherwise continue to next retry
                    }
                }
            } else {
                // Project exists, modify it with retry
                generation.setLoadingPhase('modifying');

                while (retryCount < MAX_API_RETRIES) {
                    retryCount++;

                    // Show retry message if not first attempt
                    if (retryCount > 1) {
                        chatMessages.addAssistantMessage(
                            `🔄 Retrying modification (${retryCount}/${MAX_API_RETRIES})...`
                        );
                    }

                    const result = await generation.modifyProject(project.projectState, prompt);

                    generation.setLoadingPhase('validating');
                    if (result.success && result.projectState) {
                        project.setProjectState(result.projectState, true); // Save to undo stack
                        chatMessages.addAssistantMessage(
                            getModificationSuccessMessage(result.changeSummary?.description),
                            result.changeSummary,
                            result.diffs
                        );
                        // Success - clear retry history
                        apiRetryHistoryRef.current = [];
                        break;
                    } else {
                        // Record failure
                        const errorMsg = result.error || 'Failed to modify project';
                        apiRetryHistoryRef.current.push({
                            attempt: retryCount,
                            error: errorMsg,
                            strategy: `Attempted to modify project with prompt: ${prompt.slice(0, 100)}...`,
                            timestamp: new Date().toISOString(),
                        });

                        // If this was the last retry, show error
                        if (retryCount >= MAX_API_RETRIES) {
                            chatMessages.addAssistantMessage(`Sorry, I couldn't make those changes after ${MAX_API_RETRIES} attempts: ${errorMsg}`);
                        }
                        // Otherwise continue to next retry
                    }
                }
            }
        } catch (err) {
            // Network/timeout/auth errors - don't retry these
            const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred';
            chatMessages.addAssistantMessage(`Sorry, something went wrong: ${errorMsg}`);
        } finally {
            generation.setIsLoading(false);
            generation.setLoadingPhase('idle');
            isSubmittingRef.current = false;
        }
    }, [
        project,
        chatMessages,
        generation,
        getGenerationSuccessMessage,
        getModificationSuccessMessage,
    ]);

    /**
     * Undo wrapper that adds an assistant message.
     */
    const undo = useCallback(() => {
        project.undo();
        chatMessages.addAssistantMessage('↩️ Reverted to previous state');
    }, [project, chatMessages]);

    /**
     * Redo wrapper that adds an assistant message.
     */
    const redo = useCallback(() => {
        project.redo();
        chatMessages.addAssistantMessage('↪️ Restored undone changes');
    }, [project, chatMessages]);

    return {
        submitPrompt,
        undo,
        redo,
        isSubmitting: isSubmittingRef.current,
    };
}
