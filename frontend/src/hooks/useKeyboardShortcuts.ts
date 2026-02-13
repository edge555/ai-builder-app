import { useEffect, useCallback } from 'react';

export interface KeyboardShortcutHandlers {
  onUndo?: () => void;
  onRedo?: () => void;
}

/**
 * Hook for handling keyboard shortcuts throughout the app.
 * Supports Ctrl+Z (undo), Ctrl+Shift+Z / Ctrl+Y (redo).
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs or Monaco editor
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable ||
      target.closest('.monaco-editor')
    ) {
      return;
    }

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? e.metaKey : e.ctrlKey;

    // Undo: Ctrl+Z / Cmd+Z
    if (modKey && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      handlers.onUndo?.();
      return;
    }

    // Redo: Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y
    if ((modKey && e.key === 'z' && e.shiftKey) || (modKey && e.key === 'y')) {
      e.preventDefault();
      handlers.onRedo?.();
      return;
    }
  }, [handlers]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
