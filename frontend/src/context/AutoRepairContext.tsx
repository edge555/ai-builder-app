import React, { useCallback, useMemo, useEffect } from 'react';
import { usePreviewError } from './PreviewErrorContext.context';
import { useGenerationState, useGenerationActions } from './GenerationContext.context';
import { useProject } from './ProjectContext.context';
import { useChatMessages } from './ChatMessagesContext.context';
import { AutoRepairContext, type AutoRepairContextValue } from './AutoRepairContext.context';

/**
 * Provider for unified auto-repair coordination.
 * Bridges PreviewErrorContext (error detection) and GenerationContext (repair execution).
 */
export function AutoRepairProvider({ children }: { children: React.ReactNode }) {
  const previewError = usePreviewError();
  const generationState = useGenerationState();
  const generationActions = useGenerationActions();
  const project = useProject();
  const chatMessages = useChatMessages();

  /**
   * Trigger auto-repair when errors are detected and ready.
   */
  useEffect(() => {
    // Check if we should auto-repair
    if (
      previewError.repairPhase === 'repairing' &&
      !generationState.isAutoRepairing &&
      previewError.shouldAutoRepair()
    ) {
      // Start the repair
      previewError.startAutoRepair();

      // Get the error to repair (prefer aggregated, fallback to current)
      const errorToRepair = previewError.aggregatedErrors?.totalCount
        ? previewError.currentError // Use current as representative
        : previewError.currentError;

      if (errorToRepair && project.projectState) {
        // Show repair attempt number
        const attemptNumber = generationState.autoRepairAttempt + 1;
        chatMessages.addAssistantMessage(
          `🔧 Auto-repair attempt ${attemptNumber}/3: Analyzing ${errorToRepair.type.toLowerCase().replace('_', ' ')}...`
        );

        generationActions.autoRepair(errorToRepair, project.projectState).then(success => {
          if (success) {
            // Repair succeeded
            previewError.completeAutoRepair(true);
            generationActions.resetAutoRepair();

            // Add assistant message
            chatMessages.addAssistantMessage(
              `✅ Auto-repair successful: Fixed ${errorToRepair.type.toLowerCase().replace('_', ' ')} in ${errorToRepair.filePath || 'the application'}.`
            );
          } else {
            // Repair failed
            previewError.completeAutoRepair(false);
          }
        });
      } else {
        // No error or project to repair
        previewError.completeAutoRepair(false);
      }
    }
  }, [
    previewError.repairPhase,
    previewError.shouldAutoRepair,
    generationState.isAutoRepairing,
    generationState.autoRepairAttempt,
    generationActions.autoRepair,
    generationActions.resetAutoRepair,
    previewError.currentError,
    previewError.aggregatedErrors,
    project.projectState,
    chatMessages,
    previewError.startAutoRepair,
    previewError.completeAutoRepair,
  ]);

  /**
   * Manually trigger auto-repair.
   */
  const triggerAutoRepair = useCallback(async (): Promise<boolean> => {
    const errorToRepair = previewError.currentError;
    if (!errorToRepair || !project.projectState) {
      return false;
    }

    previewError.startAutoRepair();

    // Show repair attempt number
    const attemptNumber = generationState.autoRepairAttempt + 1;
    chatMessages.addAssistantMessage(
      `🔧 Auto-repair attempt ${attemptNumber}/3: Analyzing ${errorToRepair.type.toLowerCase().replace('_', ' ')}...`
    );

    const success = await generationActions.autoRepair(errorToRepair, project.projectState);

    if (success) {
      previewError.completeAutoRepair(true);
      generationActions.resetAutoRepair();
      chatMessages.addAssistantMessage(
        `✅ Auto-repair successful: Fixed ${errorToRepair.type.toLowerCase().replace('_', ' ')} in ${errorToRepair.filePath || 'the application'}.`
      );
    } else {
      previewError.completeAutoRepair(false);
    }

    return success;
  }, [
    previewError,
    generationState.autoRepairAttempt,
    generationActions.autoRepair,
    generationActions.resetAutoRepair,
    project.projectState,
    chatMessages,
  ]);

  const value = useMemo<AutoRepairContextValue>(() => ({
    triggerAutoRepair,
  }), [triggerAutoRepair]);

  return (
    <AutoRepairContext.Provider value={value}>
      {children}
    </AutoRepairContext.Provider>
  );
}


