import { Editor } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { useRef, useEffect } from 'react';

import { getLanguageFromPath } from './utils/getLanguageFromPath';

interface MonacoEditorWrapperProps {
  filePath: string | null;
  content: string;
  onChange: (value: string) => void;
}

export function MonacoEditorWrapper({
  filePath,
  content,
  onChange,
}: MonacoEditorWrapperProps) {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const currentContentRef = useRef<string>(content);
  const isInternalChangeRef = useRef(false);

  // Handle external updates (AI generation, undo/redo)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !filePath) return;

    // Only update if content changed from external source
    if (content !== currentContentRef.current && !isInternalChangeRef.current) {
      const model = editor.getModel();
      if (!model) return;

      // Save current cursor position and scroll position
      const position = editor.getPosition();
      const scrollTop = editor.getScrollTop();
      const scrollLeft = editor.getScrollLeft();

      // Push undo stop to preserve undo history
      editor.pushUndoStop();

      // Update the value
      model.setValue(content);

      // Push another undo stop to make the update a single undo step
      editor.pushUndoStop();

      // Restore cursor position if it's still valid
      if (position) {
        const lineCount = model.getLineCount();
        const lastLineLength = model.getLineLength(lineCount);

        // Ensure position is within bounds
        const safePosition = {
          lineNumber: Math.min(position.lineNumber, lineCount),
          column: position.lineNumber <= lineCount
            ? Math.min(position.column, model.getLineLength(position.lineNumber) + 1)
            : lastLineLength + 1,
        };

        editor.setPosition(safePosition);
      }

      // Restore scroll position
      editor.setScrollTop(scrollTop);
      editor.setScrollLeft(scrollLeft);

      currentContentRef.current = content;
    }

    // Reset flag
    isInternalChangeRef.current = false;
  }, [content, filePath]);

  // Handle editor mount
  const handleEditorMount = (editor: MonacoEditor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    currentContentRef.current = content;
  };

  // Handle content change from user editing
  const handleChange = (value: string | undefined) => {
    const newValue = value || '';
    currentContentRef.current = newValue;
    isInternalChangeRef.current = true;
    onChange(newValue);
  };

  if (!filePath) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--pv-text-secondary, #888)',
          fontSize: '14px',
        }}
      >
        Select a file to start editing
      </div>
    );
  }

  const language = getLanguageFromPath(filePath);

  return (
    <Editor
      key={filePath}
      height="100%"
      language={language}
      theme="vs-dark"
      defaultValue={content}
      onMount={handleEditorMount}
      onChange={handleChange}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        wordWrap: 'on',
        automaticLayout: true,
        scrollBeyondLastLine: false,
        padding: { top: 12, bottom: 12 },
        lineNumbers: 'on',
        renderWhitespace: 'selection',
        tabSize: 2,
        insertSpaces: true,
      }}
    />
  );
}
