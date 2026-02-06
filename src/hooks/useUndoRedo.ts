import { useState, useCallback, useEffect } from 'react';
import type { SerializedProjectState } from '@/shared';

const MAX_STACK_SIZE = 20;
const STORAGE_KEY = 'ai_app_builder:undo_stack';

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
 * Hook for managing undo/redo state with local persistence.
 * Stores project states in a stack for instant restoration.
 */
export function useUndoRedo(currentState: SerializedProjectState | null): UndoRedoState & UndoRedoActions {
  const [undoStack, setUndoStack] = useState<SerializedProjectState[]>(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [redoStack, setRedoStack] = useState<SerializedProjectState[]>([]);

  // Persist undo stack to session storage
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(undoStack.slice(-MAX_STACK_SIZE)));
    } catch {
      // Session storage might be full or unavailable
    }
  }, [undoStack]);

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
    sessionStorage.removeItem(STORAGE_KEY);
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
