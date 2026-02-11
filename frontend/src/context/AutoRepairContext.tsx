import React, { createContext, useContext, useCallback, useMemo, useEffect } from 'react';
import type { RuntimeError } from '@/shared';
import { usePreviewError } from './PreviewErrorContext.context';
import { useGeneration } from './GenerationContext';
import { useProject } from './ProjectContext';
import { useChatMessages } from './ChatMessagesContext';

/**
 * Auto-repair context value.
 * Coordinates between PreviewErrorContext and GenerationContext for unified auto-repair.
 */
export interface AutoRepairContextValue {
  /**
   * Trigger auto-repair for the current errors.
   * Returns true if repair was initiated successfully.
   */
  triggerAutoRepair: () => Promise<boolean>;
}

const AutoRepairContext = createContext<AutoRepairContextValue | null>(null);

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

/**
 * Hook to access the auto-repair context.
 * Must be used within an AutoRepairProvider.
 */
export function useAutoRepair(): AutoRepairContextValue {
  const context = useContext(AutoRepairContext);
  if (!context) {
    throw new Error('useAutoRepair must be used within an AutoRepairProvider');
  }
  return context;
}
