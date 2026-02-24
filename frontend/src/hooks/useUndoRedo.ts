import type { SerializedProjectState } from '@ai-app-builder/shared/types';
import { useState, useCallback, useRef } from 'react';

const MAX_STACK_SIZE = 20;

export interface UndoRedoState {
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
 * All action callbacks are stable (never change reference) by using refs
 * to access latest state. This prevents cascading re-renders in consumers.
 *
 * Note: Undo/redo stacks are ephemeral and not persisted across page reloads.
 * For persistent state restoration, use the version history system (VersionContext).
 */
export function useUndoRedo(currentState: SerializedProjectState | null): UndoRedoState & UndoRedoActions {
  const [undoStack, setUndoStack] = useState<SerializedProjectState[]>([]);
  const [redoStack, setRedoStack] = useState<SerializedProjectState[]>([]);

  // Refs for accessing latest values inside stable callbacks
  const currentStateRef = useRef(currentState);
  currentStateRef.current = currentState;
  const undoStackRef = useRef(undoStack);
  undoStackRef.current = undoStack;
  const redoStackRef = useRef(redoStack);
  redoStackRef.current = redoStack;

  const pushState = useCallback((state: SerializedProjectState) => {
    setUndoStack((prev) => {
      const newStack = [...prev, state].slice(-MAX_STACK_SIZE);
      return newStack;
    });
    // Clear redo stack when new state is pushed
    setRedoStack([]);
  }, []);

  const undo = useCallback((): SerializedProjectState | null => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return null;

    const previousState = stack[stack.length - 1];

    // Move current state to redo stack
    const current = currentStateRef.current;
    if (current) {
      setRedoStack((prev) => [...prev, current].slice(-MAX_STACK_SIZE));
    }

    // Remove from undo stack
    setUndoStack((prev) => prev.slice(0, -1));

    return previousState;
  }, []);

  const redo = useCallback((): SerializedProjectState | null => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return null;

    const nextState = stack[stack.length - 1];

    // Move current state to undo stack
    const current = currentStateRef.current;
    if (current) {
      setUndoStack((prev) => [...prev, current].slice(-MAX_STACK_SIZE));
    }

    // Remove from redo stack
    setRedoStack((prev) => prev.slice(0, -1));

    return nextState;
  }, []);

  const clear = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  return {
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    pushState,
    undo,
    redo,
    clear,
  };
}
