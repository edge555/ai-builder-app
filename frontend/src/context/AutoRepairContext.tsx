import React, { useCallback, useMemo, useEffect } from 'react';
import { usePreviewError } from './PreviewErrorContext.context';
import { useGeneration } from './GenerationContext.context';
import { useProject } from './ProjectContext.context';
import { useChatMessages } from './ChatMessagesContext.context';
import { AutoRepairContext, type AutoRepairContextValue } from './AutoRepairContext.context';

/**
 * Provider for unified auto-repair coordination.
 * Bridges PreviewErrorContext (error detection) and GenerationContext (repair execution).
 */
export function AutoRepairProvider({ children }: { children: React.ReactNode }) {
  const previewError = usePreviewError();
  const generation = useGeneration();
  const project = useProject();
  const chatMessages = useChatMessages();

  /**
   * Trigger auto-repair when errors are detected and ready.
   */
  useEffect(() => {
    // Check if we should auto-repair
    if (
      previewError.repairPhase === 'repairing' &&
      !generation.isAutoRepairing &&
      previewError.shouldAutoRepair()
    ) {
      // Start the repair
      previewError.startAutoRepair();

      // Get the error to repair (prefer aggregated, fallback to current)
      const errorToRepair = previewError.aggregatedErrors?.totalCount
        ? previewError.currentError // Use current as representative
        : previewError.currentError;

      if (errorToRepair && project.projectState) {
        generation.autoRepair(errorToRepair, project.projectState).then(success => {
          if (success) {
            // Repair succeeded
            previewError.completeAutoRepair(true);
            generation.resetAutoRepair();

            // Add assistant message
            chatMessages.addAssistantMessage(
              `🔧 Auto-repair applied: Fixed ${errorToRepair.type.toLowerCase().replace('_', ' ')} in ${errorToRepair.filePath || 'the application'}.`
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
    generation.isAutoRepairing,
    previewError.currentError,
    previewError.aggregatedErrors,
    project.projectState,
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
    const success = await generation.autoRepair(errorToRepair, project.projectState);

    if (success) {
      previewError.completeAutoRepair(true);
      generation.resetAutoRepair();
      chatMessages.addAssistantMessage(
        `🔧 Auto-repair applied: Fixed ${errorToRepair.type.toLowerCase().replace('_', ' ')} in ${errorToRepair.filePath || 'the application'}.`
      );
    } else {
      previewError.completeAutoRepair(false);
    }

    return success;
  }, [
    previewError,
    generation,
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


