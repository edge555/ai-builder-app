import { useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react';

import { createLogger } from '../utils/logger';
import { AutoRepairContext, type AutoRepairContextValue } from './AutoRepairContext.context';
import { useChatMessages } from './ChatMessagesContext.context';
import { useGenerationState, useGenerationActions } from './GenerationContext.context';
import { usePreviewErrorState, usePreviewErrorActions } from './PreviewErrorContext.context';
import { useProjectState } from './ProjectContext.context';

const repairLogger = createLogger('AutoRepair');

/**
 * Provider for unified auto-repair coordination.
 * Bridges preview error detection with the generation repair action.
 */
export function AutoRepairProvider({ children }: { children: ReactNode }) {
  // Split state and actions to reduce re-renders
  const previewErrorState = usePreviewErrorState();
  const previewErrorActions = usePreviewErrorActions();
  const generationState = useGenerationState();
  const generationActions = useGenerationActions();
  const { projectState } = useProjectState();
  const chatMessages = useChatMessages();

  // Prevent concurrent auto-repair evaluations
  const isEvaluatingRef = useRef(false);

  /**
   * Trigger auto-repair when errors are detected and ready.
   */
  useEffect(() => {
    // Prevent concurrent evaluations
    if (isEvaluatingRef.current) {
      return;
    }

    // Check if we should auto-repair (inline the check to avoid unstable function dependency)
    const hasError = previewErrorState.currentError !== null ||
      (previewErrorState.aggregatedErrors?.totalCount ?? 0) > 0;
    const shouldRepair =
      previewErrorState.repairPhase === 'repairing' &&
      !generationState.isAutoRepairing &&
      !previewErrorState.isAutoRepairing &&
      hasError &&
      previewErrorState.repairAttempts < previewErrorState.maxRepairAttempts;

    if (!shouldRepair) {
      return;
    }

    // Mark as evaluating
    isEvaluatingRef.current = true;

    // Start the repair
    previewErrorActions.startAutoRepair();

    // Get the error to repair (prefer highest-priority from aggregated set)
    const errorToRepair = previewErrorState.aggregatedErrors?.errors[0]
      ?? previewErrorState.currentError;

    if (errorToRepair && projectState) {
      // Show repair attempt number
      const attemptNumber = generationState.autoRepairAttempt + 1;
      chatMessages.addAssistantMessage(
        `🔧 Auto-repair attempt ${attemptNumber}/${previewErrorState.maxRepairAttempts}: Analyzing ${errorToRepair.type.toLowerCase().replace('_', ' ')}...`
      );

      generationActions.autoRepair(errorToRepair, projectState, previewErrorState.aggregatedErrors)
        .then(success => {
          if (success) {
            // Repair succeeded
            previewErrorActions.completeAutoRepair(true);
            generationActions.resetAutoRepair();

            // Add assistant message
            chatMessages.addAssistantMessage(
              `✅ Auto-repair successful: Fixed ${errorToRepair.type.toLowerCase().replace('_', ' ')} in ${errorToRepair.filePath || 'the application'}.`
            );
          } else {
            // Repair failed
            previewErrorActions.completeAutoRepair(false);

            // Suggest revert after final attempt
            const isLastAttempt = previewErrorState.repairAttempts + 1 >= previewErrorState.maxRepairAttempts;
            if (isLastAttempt) {
              chatMessages.addAssistantMessage(
                `⚠️ Auto-repair failed after ${previewErrorState.maxRepairAttempts} attempts. Use the **↩ Undo** button in the toolbar to revert to the last working version.`
              );
            }
          }
        })
        .catch(error => {
          // Handle unexpected errors during auto-repair
          repairLogger.error('Auto-repair failed', { error: error instanceof Error ? error.message : String(error) });
          previewErrorActions.completeAutoRepair(false);
          chatMessages.addAssistantMessage(
            `❌ Auto-repair encountered an error: ${error.message || 'Unknown error'}`
          );
        })
        .finally(() => {
          // Reset evaluating flag
          isEvaluatingRef.current = false;
        });
    } else {
      // No error or project to repair
      previewErrorActions.completeAutoRepair(false);
      isEvaluatingRef.current = false;
    }
  }, [
    // Only depend on the actual state values we need to check
    previewErrorState.repairPhase,
    previewErrorState.currentError,
    previewErrorState.aggregatedErrors,
    previewErrorState.isAutoRepairing,
    previewErrorState.repairAttempts,
    previewErrorState.maxRepairAttempts,
    generationState.isAutoRepairing,
    generationState.autoRepairAttempt,
    projectState,
    // Stable actions (wrapped in useCallback)
    previewErrorActions.startAutoRepair,
    previewErrorActions.completeAutoRepair,
    generationActions.autoRepair,
    generationActions.resetAutoRepair,
    chatMessages.addAssistantMessage,
  ]);

  /**
   * Manually trigger auto-repair.
   */
  const triggerAutoRepair = useCallback(async (): Promise<boolean> => {
    const errorToRepair = previewErrorState.aggregatedErrors?.errors[0]
      ?? previewErrorState.currentError;
    if (!errorToRepair || !projectState) {
      return false;
    }

    // Prevent concurrent manual repairs
    if (isEvaluatingRef.current) {
      return false;
    }

    isEvaluatingRef.current = true;

    try {
      previewErrorActions.startAutoRepair();

      // Show repair attempt number
      const attemptNumber = generationState.autoRepairAttempt + 1;
      chatMessages.addAssistantMessage(
        `🔧 Auto-repair attempt ${attemptNumber}/${previewErrorState.maxRepairAttempts}: Analyzing ${errorToRepair.type.toLowerCase().replace('_', ' ')}...`
      );

      const success = await generationActions.autoRepair(errorToRepair, projectState, previewErrorState.aggregatedErrors);

      if (success) {
        previewErrorActions.completeAutoRepair(true);
        generationActions.resetAutoRepair();
        chatMessages.addAssistantMessage(
          `✅ Auto-repair successful: Fixed ${errorToRepair.type.toLowerCase().replace('_', ' ')} in ${errorToRepair.filePath || 'the application'}.`
        );
      } else {
        previewErrorActions.completeAutoRepair(false);
        const isLastAttempt = generationState.autoRepairAttempt + 1 >= previewErrorState.maxRepairAttempts;
        if (isLastAttempt) {
          chatMessages.addAssistantMessage(
            `⚠️ Auto-repair failed after ${previewErrorState.maxRepairAttempts} attempts. Use the **↩ Undo** button in the toolbar to revert to the last working version.`
          );
        }
      }

      return success;
    } catch (error) {
      // Handle unexpected errors during manual repair
      repairLogger.error('Manual auto-repair failed', { error: error instanceof Error ? error.message : String(error) });
      previewErrorActions.completeAutoRepair(false);
      chatMessages.addAssistantMessage(
        `❌ Auto-repair encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return false;
    } finally {
      isEvaluatingRef.current = false;
    }
  }, [
    previewErrorState.currentError,
    previewErrorState.maxRepairAttempts,
    previewErrorActions.startAutoRepair,
    previewErrorActions.completeAutoRepair,
    generationState.autoRepairAttempt,
    generationActions.autoRepair,
    generationActions.resetAutoRepair,
    projectState,
    chatMessages.addAssistantMessage,
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

