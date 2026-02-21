import { useEffect, useCallback, useRef } from 'react';

export interface KeyboardShortcutHandlers {
  onUndo?: () => void;
  onRedo?: () => void;
  onToggleSidebar?: () => void;
}

/**
 * Hook for handling keyboard shortcuts throughout the app.
 * Supports:
 * - Ctrl+Z / Cmd+Z (undo)
 * - Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y (redo)
 * - Ctrl+B / Cmd+B (toggle sidebar)
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  // Use a ref to keep handlers stable across re-renders
  const handlersRef = useRef(handlers);

  // Keep the ref in sync with the latest handlers
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

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
      handlersRef.current.onUndo?.();
      return;
    }

    // Redo: Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y
    if ((modKey && e.key === 'z' && e.shiftKey) || (modKey && e.key === 'y')) {
      e.preventDefault();
      handlersRef.current.onRedo?.();
      return;
    }

    // Toggle Sidebar: Ctrl+B / Cmd+B
    if (modKey && e.key === 'b' && !e.shiftKey) {
      e.preventDefault();
      handlersRef.current.onToggleSidebar?.();
      return;
    }
  }, []); // Empty dependency array means handleKeyDown is stable

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
