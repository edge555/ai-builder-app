import React, { useState, useCallback, useMemo, useRef } from 'react';
import type { SerializedProjectState } from '@/shared';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { ProjectContext, type ProjectContextValue, type VersionCallbacks } from './ProjectContext.context';

/**
 * Provider for project state management.
 * Manages project state, undo/redo, and version callbacks.
 */
export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projectState, setProjectStateInternal] = useState<SerializedProjectState | null>(null);
  const versionCallbacksRef = useRef<VersionCallbacks>({});

  // Undo/Redo hook
  const undoRedo = useUndoRedo(projectState);

  /**
   * Sets version callbacks for integration with VersionContext.
   */
  const setVersionCallbacks = useCallback((callbacks: VersionCallbacks) => {
    versionCallbacksRef.current = callbacks;
  }, []);

  /**
   * Sets the project state and notifies callbacks.
   * Optionally saves to undo stack.
   */
  const setProjectState = useCallback((newState: SerializedProjectState | null, saveToUndo = false) => {
    // Save current state to undo stack before changing
    if (saveToUndo && projectState) {
      undoRedo.pushState(projectState);
    }
    setProjectStateInternal(newState);
    if (newState && versionCallbacksRef.current.onProjectStateChanged) {
      versionCallbacksRef.current.onProjectStateChanged(newState);
    }
  }, [projectState, undoRedo]);

  /**
   * Undo to previous project state.
   */
  const undo = useCallback(() => {
    const previousState = undoRedo.undo();
    if (previousState) {
      setProjectStateInternal(previousState);
    }
  }, [undoRedo]);

  /**
   * Redo to next project state.
   */
  const redo = useCallback(() => {
    const nextState = undoRedo.redo();
    if (nextState) {
      setProjectStateInternal(nextState);
    }
  }, [undoRedo]);

  const value = useMemo<ProjectContextValue>(() => ({
    projectState,
    setProjectState,
    setVersionCallbacks,
    undo,
    redo,
    canUndo: undoRedo.canUndo,
    canRedo: undoRedo.canRedo,
  }), [projectState, setProjectState, setVersionCallbacks, undo, redo, undoRedo.canUndo, undoRedo.canRedo]);

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}


