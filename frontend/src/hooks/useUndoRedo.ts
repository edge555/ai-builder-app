import { useState, useCallback } from 'react';
import type { SerializedProjectState } from '@/shared';

const MAX_STACK_SIZE = 20;

export interface UndoRedoState {
  undoStack: SerializedProjectState[];
  redoStack: SerializedProjectState[];
  canUndo: boolean;
  canRedo: boolean;
}

export interface UndoRedoActions {
  pushState: (state: SerializedProjectState) => void;
  undo: () => SerializedProjectState | null;
  redo: () => SerializedProjectState | null;
  clear: () => void;
}

/**
 * Hook for managing undo/redo state in memory.
 * Stores project states in a stack for instant restoration during the current session.
 *
 * Note: Undo/redo stacks are ephemeral and not persisted across page reloads.
 * For persistent state restoration, use the version history system (VersionContext).
 */
export function useUndoRedo(currentState: SerializedProjectState | null): UndoRedoState & UndoRedoActions {
  const [undoStack, setUndoStack] = useState<SerializedProjectState[]>([]);
  const [redoStack, setRedoStack] = useState<SerializedProjectState[]>([]);

  const pushState = useCallback((state: SerializedProjectState) => {
    setUndoStack((prev) => {
      const newStack = [...prev, state].slice(-MAX_STACK_SIZE);
      return newStack;
    });
    // Clear redo stack when new state is pushed
    setRedoStack([]);
  }, []);

  const undo = useCallback((): SerializedProjectState | null => {
    if (undoStack.length === 0) return null;

    const previousState = undoStack[undoStack.length - 1];
    
    // Move current state to redo stack
    if (currentState) {
      setRedoStack((prev) => [...prev, currentState].slice(-MAX_STACK_SIZE));
    }
    
    // Remove from undo stack
    setUndoStack((prev) => prev.slice(0, -1));
    
    return previousState;
  }, [undoStack, currentState]);

  const redo = useCallback((): SerializedProjectState | null => {
    if (redoStack.length === 0) return null;

    const nextState = redoStack[redoStack.length - 1];
    
    // Move current state to undo stack
    if (currentState) {
      setUndoStack((prev) => [...prev, currentState].slice(-MAX_STACK_SIZE));
    }
    
    // Remove from redo stack
    setRedoStack((prev) => prev.slice(0, -1));
    
    return nextState;
  }, [redoStack, currentState]);

  const clear = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  return {
    undoStack,
    redoStack,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    pushState,
    undo,
    redo,
    clear,
  };
}
