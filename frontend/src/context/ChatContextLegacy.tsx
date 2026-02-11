/**
 * Legacy ChatContext Compatibility Layer
 * 
 * This file provides backwards compatibility with the old monolithic ChatContext.
 * It wraps the new split contexts (ProjectContext, ChatMessagesContext, GenerationContext)
 * and provides the same interface as the old ChatContext.
 * 
 * This allows existing components to continue working while we migrate to the new architecture.
 */

import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import type { SerializedProjectState, RuntimeError, ChangeSummary, FileDiff } from '@/shared';
import { ChatContext, type ChatContextValue, type ChatProviderProps } from './ChatContext.context';
import { ProjectProvider, useProject } from './ProjectContext';
import { ChatMessagesProvider, useChatMessages } from './ChatMessagesContext';
import { GenerationProvider, useGeneration } from './GenerationContext';
import { PreviewErrorProvider } from './PreviewErrorContext';
import { AutoRepairProvider } from './AutoRepairContext';

/**
 * Inner provider that bridges the new split contexts to the old ChatContext interface.
 */
function ChatContextBridge({ children, initialPrompt }: { children: React.ReactNode; initialPrompt?: string }) {
  const project = useProject();
  const chatMessages = useChatMessages();
  const generation = useGeneration();

  const isSubmittingRef = useRef(false);
  const initialPromptSubmittedRef = useRef(false);

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
   */
  const submitPrompt = useCallback(async (prompt: string): Promise<void> => {
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    generation.clearError();
    generation.setIsLoading(true);
    chatMessages.addUserMessage(prompt);

    try {
      if (!project.projectState) {
        // No project exists, generate a new one using streaming
        generation.setLoadingPhase('generating');
        const result = await generation.generateProjectStreaming(prompt);

        generation.setLoadingPhase('validating');
        if (result.success && result.projectState) {
          project.setProjectState(result.projectState, false);
          const fileCount = Object.keys(result.projectState.files).length;
          chatMessages.addAssistantMessage(
            getGenerationSuccessMessage(result.projectState.name, fileCount)
          );
          // Version callback would be handled here if needed
        } else {
          const errorMsg = result.error || 'Failed to generate project';
          chatMessages.addAssistantMessage(`Sorry, I couldn't generate the project: ${errorMsg}`);
        }
      } else {
        // Project exists, modify it - save to undo stack first
        generation.setLoadingPhase('modifying');
        const result = await generation.modifyProject(project.projectState, prompt);

        generation.setLoadingPhase('validating');
        if (result.success && result.projectState) {
          project.setProjectState(result.projectState, true); // Save to undo stack
          chatMessages.addAssistantMessage(
            getModificationSuccessMessage(result.changeSummary?.description),
            result.changeSummary,
            result.diffs
          );
          // Version callbacks would be handled here if needed
        } else {
          const errorMsg = result.error || 'Failed to modify project';
          chatMessages.addAssistantMessage(`Sorry, I couldn't make those changes: ${errorMsg}`);
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred';
      chatMessages.addAssistantMessage(`Sorry, something went wrong: ${errorMsg}`);
    } finally {
      generation.setIsLoading(false);
      generation.setLoadingPhase('idle');
      isSubmittingRef.current = false;
    }
  }, [
    project.projectState,
    chatMessages,
    generation,
    project,
    getGenerationSuccessMessage,
    getModificationSuccessMessage,
  ]);

  // Submit initial prompt on mount if provided
  useEffect(() => {
    if (initialPrompt && !initialPromptSubmittedRef.current && !isSubmittingRef.current) {
      initialPromptSubmittedRef.current = true;
      const timer = setTimeout(() => {
        submitPrompt(initialPrompt);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [initialPrompt, submitPrompt]);

  /**
   * Auto-repair wrapper that uses the new generation context.
   */
  const autoRepair = useCallback(async (runtimeError: RuntimeError): Promise<boolean> => {
    return generation.autoRepair(runtimeError, project.projectState);
  }, [generation, project.projectState]);

  /**
   * Undo with message.
   */
  const undo = useCallback(() => {
    project.undo();
    chatMessages.addAssistantMessage('↩️ Reverted to previous state');
  }, [project, chatMessages]);

  /**
   * Redo with message.
   */
  const redo = useCallback(() => {
    project.redo();
    chatMessages.addAssistantMessage('↪️ Restored undone changes');
  }, [project, chatMessages]);

  const value = useMemo<ChatContextValue>(() => ({
    messages: chatMessages.messages,
    isLoading: generation.isLoading,
    loadingPhase: generation.loadingPhase,
    projectState: project.projectState,
    error: generation.error,
    isAutoRepairing: generation.isAutoRepairing,
    autoRepairAttempt: generation.autoRepairAttempt,
    streamingState: generation.streamingState,
    isStreaming: generation.isStreaming,
    submitPrompt,
    clearMessages: chatMessages.clearMessages,
    clearError: generation.clearError,
    setProjectState: project.setProjectState,
    setVersionCallbacks: project.setVersionCallbacks,
    autoRepair,
    resetAutoRepair: generation.resetAutoRepair,
    undo,
    redo,
    canUndo: project.canUndo,
    canRedo: project.canRedo,
  }), [
    chatMessages.messages,
    chatMessages.clearMessages,
    generation.isLoading,
    generation.loadingPhase,
    generation.error,
    generation.isAutoRepairing,
    generation.autoRepairAttempt,
    generation.streamingState,
    generation.isStreaming,
    generation.clearError,
    generation.resetAutoRepair,
    project.projectState,
    project.setProjectState,
    project.setVersionCallbacks,
    project.canUndo,
    project.canRedo,
    submitPrompt,
    autoRepair,
    undo,
    redo,
  ]);

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}

/**
 * Legacy ChatProvider that maintains backwards compatibility.
 * Uses the new split context architecture internally.
 */
export function ChatProvider({ children, apiConfig, initialPrompt }: ChatProviderProps) {
  return (
    <ProjectProvider>
      <ChatMessagesProvider>
        <GenerationProvider>
          <PreviewErrorProvider>
            <AutoRepairProvider>
              <ChatContextBridge initialPrompt={initialPrompt}>
                {children}
              </ChatContextBridge>
            </AutoRepairProvider>
          </PreviewErrorProvider>
        </GenerationProvider>
      </ChatMessagesProvider>
    </ProjectProvider>
  );
}
