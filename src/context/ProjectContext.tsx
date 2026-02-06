import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
import type { SerializedProjectState, SerializedVersion, FileDiff } from '@/shared';
import { useUndoRedo } from '@/hooks/useUndoRedo';

/**
 * Callbacks for version integration.
 */
export interface VersionCallbacks {
  onVersionCreated?: (version: SerializedVersion) => void;
  onDiffsComputed?: (diffs: FileDiff[]) => void;
  onProjectStateChanged?: (projectState: SerializedProjectState) => void;
}

/**
 * Project context value.
 */
export interface ProjectContextValue {
  projectState: SerializedProjectState | null;
  setProjectState: (projectState: SerializedProjectState | null, saveToUndo?: boolean) => void;
  setVersionCallbacks: (callbacks: VersionCallbacks) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

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

/**
 * Hook to access the project context.
 * Must be used within a ProjectProvider.
 */
export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
