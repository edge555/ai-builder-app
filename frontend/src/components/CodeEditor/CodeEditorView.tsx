import type { SerializedProjectState } from '@/shared';
import { useState, useEffect, useRef, useCallback, lazy, Suspense, memo } from 'react';


import { ComponentErrorBoundary } from '@/components/ComponentErrorBoundary';
import { useProjectState, useProjectActions } from '@/context/ProjectContext.context';

import { CodeEditorSkeleton } from './CodeEditorSkeleton';
import { FileTreeSidebar } from './FileTreeSidebar';
import { TabBar } from './TabBar';

import './CodeEditorView.css';

const MonacoEditorWrapper = lazy(() => import('./MonacoEditorWrapper').then(m => ({ default: m.MonacoEditorWrapper })));

interface CodeEditorViewProps {
  files: Record<string, string>;
}

const CodeEditorViewComponent = function CodeEditorView({ files }: CodeEditorViewProps) {
  const { projectState } = useProjectState();
  const { setProjectState } = useProjectActions();

  // UI state
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);

  // Refs for debouncing and AI sync
  const projectStateRef = useRef<SerializedProjectState | null>(projectState);
  const pendingChangesRef = useRef<Map<string, string>>(new Map());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedVersionRef = useRef<string | null>(projectState?.updatedAt || null);

  // Keep projectStateRef in sync
  useEffect(() => {
    projectStateRef.current = projectState;
  }, [projectState]);

  // Auto-open entry file when no files are open
  useEffect(() => {
    const filePaths = Object.keys(files);

    if (filePaths.length > 0 && openFiles.length === 0) {
      // Try to find src/App.tsx or src/App.jsx
      const entryFile = filePaths.find(
        (path) => path === 'src/App.tsx' || path === 'src/App.jsx'
      );

      const fileToOpen = entryFile || filePaths[0];
      setOpenFiles([fileToOpen]);
      setActiveFile(fileToOpen);
    }
  }, [files, openFiles.length]);

  // Detect AI/undo/redo changes and clear pending edits
  useEffect(() => {
    if (!projectState) return;

    const currentUpdatedAt = projectState.updatedAt;
    const lastSavedAt = lastSavedVersionRef.current;

    // If updatedAt changed and it's not our own save
    if (currentUpdatedAt !== lastSavedAt && lastSavedAt !== null) {
      // External change detected (AI, undo, redo)
      // Clear any pending changes and debounce timer
      // Monaco will update via content prop change
      pendingChangesRef.current.clear();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    }

    // Update our tracking ref
    lastSavedVersionRef.current = currentUpdatedAt;
  }, [projectState]);

  // Handle case where active file is removed by AI
  useEffect(() => {
    if (activeFile && !files[activeFile]) {
      // Active file was removed, close it
      setOpenFiles((prev) => prev.filter((path) => path !== activeFile));
      setActiveFile(null);
    }

    // Clean up open files that no longer exist
    setOpenFiles((prev) => prev.filter((path) => files[path] !== undefined));
  }, [files, activeFile]);

  // Debounced save to project state
  const flushPendingChanges = useCallback(() => {
    const currentState = projectStateRef.current;
    if (!currentState || pendingChangesRef.current.size === 0) return;

    // Apply all pending changes
    const newFiles = { ...currentState.files };
    pendingChangesRef.current.forEach((content, path) => {
      newFiles[path] = content;
    });

    // Clear pending changes
    pendingChangesRef.current.clear();

    // Update project state without creating undo point (false)
    // Monaco's own undo handles editor history
    const newState: SerializedProjectState = {
      ...currentState,
      files: newFiles,
      updatedAt: new Date().toISOString(),
    };

    // Track this as our own save
    lastSavedVersionRef.current = newState.updatedAt;

    setProjectState(newState, false);
  }, [setProjectState]);

  // Handle file content change from Monaco
  const handleFileChange = useCallback((path: string, content: string) => {
    // Store in pending changes map
    pendingChangesRef.current.set(path, content);

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounce timer (500ms)
    debounceTimerRef.current = setTimeout(() => {
      flushPendingChanges();
      debounceTimerRef.current = null;
    }, 500);
  }, [flushPendingChanges]);

  // Handle file selection from tree
  const handleFileSelect = useCallback((path: string) => {
    // Open file if not already open
    if (!openFiles.includes(path)) {
      setOpenFiles((prev) => [...prev, path]);
    }
    setActiveFile(path);
  }, [openFiles]);

  // Handle tab selection
  const handleTabSelect = useCallback((path: string) => {
    setActiveFile(path);
  }, []);

  // Handle tab close
  const handleTabClose = useCallback((path: string) => {
    setOpenFiles((prev) => {
      const newOpenFiles = prev.filter((p) => p !== path);

      // If closing active tab, activate another one
      if (path === activeFile) {
        const closingIndex = prev.indexOf(path);

        // Try right, then left
        if (closingIndex < prev.length - 1) {
          setActiveFile(prev[closingIndex + 1]);
        } else if (closingIndex > 0) {
          setActiveFile(prev[closingIndex - 1]);
        } else {
          setActiveFile(null);
        }
      }

      return newOpenFiles;
    });
  }, [activeFile]);

  // Get content for active file (prefer pending changes, fallback to saved)
  const getActiveFileContent = (): string => {
    if (!activeFile) return '';

    // Check pending changes first
    if (pendingChangesRef.current.has(activeFile)) {
      return pendingChangesRef.current.get(activeFile)!;
    }

    // Fallback to saved content
    return files[activeFile] || '';
  };

  return (
    <div className="code-editor-view">
      {/* File Tree Sidebar */}
      <FileTreeSidebar
        files={files}
        activeFile={activeFile}
        onFileSelect={handleFileSelect}
      />

      {/* Editor Area */}
      <div className="code-editor-main">
        {/* Tab Bar */}
        <TabBar
          openFiles={openFiles}
          activeFile={activeFile}
          onTabSelect={handleTabSelect}
          onTabClose={handleTabClose}
        />

        {/* Monaco Editor */}
        <div className="code-editor-content">
          <ComponentErrorBoundary componentName="Code Editor">
            <Suspense fallback={<CodeEditorSkeleton />}>
              <MonacoEditorWrapper
                filePath={activeFile}
                content={getActiveFileContent()}
                onChange={(value) => {
                  if (activeFile) {
                    handleFileChange(activeFile, value);
                  }
                }}
              />
            </Suspense>
          </ComponentErrorBoundary>
        </div>
      </div>
    </div>
  );
};

/**
 * Custom comparator for CodeEditorView memoization.
 * Deep compares files object to avoid re-render when file contents haven't changed.
 */
function areCodeEditorPropsEqual(
  prevProps: Readonly<CodeEditorViewProps>,
  nextProps: Readonly<CodeEditorViewProps>
): boolean {
  const prevFiles = prevProps.files;
  const nextFiles = nextProps.files;

  if (prevFiles === nextFiles) {
    return true; // Same reference
  }

  // Compare file keys
  const prevKeys = Object.keys(prevFiles);
  const nextKeys = Object.keys(nextFiles);

  if (prevKeys.length !== nextKeys.length) {
    return false;
  }

  // Compare file contents
  return prevKeys.every(key => prevFiles[key] === nextFiles[key]);
}

/**
 * Memoized CodeEditorView - only re-renders when files actually change.
 * Monaco is expensive to update, so this prevents unnecessary re-renders.
 */
export const CodeEditorView = memo(CodeEditorViewComponent, areCodeEditorPropsEqual);
