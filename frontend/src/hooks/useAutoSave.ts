import type { SerializedProjectState } from '@/shared';
import { useEffect, useState, useRef } from 'react';

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
  const isMountedRef = useRef(true);

  // Keep refs always up-to-date so the save callback reads current data
  // without needing the full objects as effect dependencies.
  const projectStateRef = useRef(projectState);
  projectStateRef.current = projectState;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Extract stable primitives that represent meaningful changes.
  // Depending on full objects would restart the debounce on every render
  // (new object references) even when data is identical.
  const projectId = projectState?.id;
  const projectVersionId = projectState?.currentVersionId;
  const projectUpdatedAt = projectState?.updatedAt;
  const messageCount = messages.length;

  useEffect(() => {
    // Don't save if no project state
    if (!projectStateRef.current) {
      return;
    }

    // Clear any pending save
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Schedule new save after debounce delay
    debounceTimerRef.current = setTimeout(async () => {
      // Guard against unmounted component
      if (!isMountedRef.current) {
        return;
      }

      setIsSaving(true);
      setSaveError(null);

      try {
        // Read from refs to get the latest values (avoids stale closures)
        const currentProjectState = projectStateRef.current!;
        const currentMessages = messagesRef.current;

        // Build stored project from current state
        const storedProject = toStoredProject(currentProjectState, currentMessages);

        // Save to IndexedDB
        await storageService.saveProject(storedProject);

        // Save last opened project ID to metadata
        await storageService.setMetadata('lastOpenedProjectId', currentProjectState.id);

        // Update last saved timestamp (guard against unmount during async operation)
        if (isMountedRef.current) {
          setLastSavedAt(new Date());
        }
      } catch (error) {
        autoSaveLogger.error('Auto-save failed', { error });
        // Guard against unmount during async operation
        if (isMountedRef.current) {
          setSaveError(error instanceof Error ? error : new Error('Unknown save error'));
        }
      } finally {
        // Guard against unmount during async operation
        if (isMountedRef.current) {
          setIsSaving(false);
        }
      }
    }, debounceMs);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [projectId, projectVersionId, projectUpdatedAt, messageCount, debounceMs]);

  return {
    isSaving,
    lastSavedAt,
    saveError,
  };
}
