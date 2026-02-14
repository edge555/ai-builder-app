import { useEffect, useState, useRef } from 'react';
import type { SerializedProjectState } from '@/shared';
import type { ChatMessage } from '@/components';
import { storageService, toStoredProject } from '@/services/storage';
import { createLogger } from '@/utils/logger';

const autoSaveLogger = createLogger('AutoSave');

export interface UseAutoSaveOptions {
  /** Debounce delay in milliseconds (default: 1500ms) */
  debounceMs?: number;
}

export interface UseAutoSaveResult {
  /** Whether a save operation is in progress */
  isSaving: boolean;
  /** Timestamp of last successful save */
  lastSavedAt: Date | null;
  /** Most recent save error, if any */
  saveError: Error | null;
}

/**
 * Hook for auto-saving project state and chat messages to IndexedDB.
 * Debounces save operations to avoid excessive writes.
 */
export function useAutoSave(
  projectState: SerializedProjectState | null,
  messages: ChatMessage[],
  options: UseAutoSaveOptions = {}
): UseAutoSaveResult {
  const { debounceMs = 1500 } = options;

  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<Error | null>(null);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Don't save if no project state
    if (!projectState) {
      return;
    }

    // Clear any pending save
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Schedule new save after debounce delay
    debounceTimerRef.current = setTimeout(async () => {
      setIsSaving(true);
      setSaveError(null);

      try {
        // Build stored project from current state
        const storedProject = toStoredProject(projectState, messages);

        // Save to IndexedDB
        await storageService.saveProject(storedProject);

        // Save last opened project ID to metadata
        await storageService.setMetadata('lastOpenedProjectId', projectState.id);

        // Update last saved timestamp
        setLastSavedAt(new Date());
      } catch (error) {
        autoSaveLogger.error('Auto-save failed', { error });
        setSaveError(error instanceof Error ? error : new Error('Unknown save error'));
      } finally {
        setIsSaving(false);
      }
    }, debounceMs);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [projectState, messages, debounceMs]);

  return {
    isSaving,
    lastSavedAt,
    saveError,
  };
}
