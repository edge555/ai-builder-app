import type { SerializedProjectState } from '@ai-app-builder/shared/types';
import { useState, useCallback, useMemo, useRef, type ReactNode } from 'react';

import { useUndoRedo } from '@/hooks/useUndoRedo';

import {
  ProjectStateContext,
  ProjectActionsContext,
  ProjectContext,
  type ProjectStateValue,
  type ProjectActionsValue,
  type ProjectContextValue,
  type VersionCallbacks,
} from './ProjectContext.context';

export interface ProjectProviderProps {
  children: ReactNode;
  /** Optional initial project state for restoration */
  initialState?: SerializedProjectState | null;
}

/**
 * Provider for project state management.
 * Manages project state, undo/redo, and version callbacks.
 * Provides three contexts: state-only, actions-only, and combined (for backward compat).
 */
export function ProjectProvider({ children, initialState }: ProjectProviderProps) {
  const [projectState, setProjectStateInternal] = useState<SerializedProjectState | null>(initialState ?? null);
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

  /**
   * Renames the current project.
   * Updates the project name and updatedAt timestamp.
   */
  const renameProject = useCallback((newName: string) => {
    if (!projectState) return;

    const updatedState: SerializedProjectState = {
      ...projectState,
      name: newName,
      updatedAt: new Date().toISOString(),
    };

    setProjectState(updatedState, false);
  }, [projectState, setProjectState]);

  // State context: re-renders subscribers when projectState or undo/redo flags change.
  const stateValue = useMemo<ProjectStateValue>(() => ({
    projectState,
    canUndo: undoRedo.canUndo,
    canRedo: undoRedo.canRedo,
  }), [projectState, undoRedo.canUndo, undoRedo.canRedo]);

  // Actions context: stable callbacks — subscribers don't re-render on state changes.
  const actionsValue = useMemo<ProjectActionsValue>(() => ({
    setProjectState,
    setVersionCallbacks,
    renameProject,
    undo,
    redo,
  }), [setProjectState, setVersionCallbacks, renameProject, undo, redo]);

  // Combined context for backward compatibility.
  const combinedValue = useMemo<ProjectContextValue>(() => ({
    ...stateValue,
    ...actionsValue,
  }), [stateValue, actionsValue]);

  return (
    <ProjectStateContext.Provider value={stateValue}>
      <ProjectActionsContext.Provider value={actionsValue}>
        <ProjectContext.Provider value={combinedValue}>
          {children}
        </ProjectContext.Provider>
      </ProjectActionsContext.Provider>
    </ProjectStateContext.Provider>
  );
}


