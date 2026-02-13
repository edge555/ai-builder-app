import { Editor } from '@monaco-editor/react';
import { getLanguageFromPath } from './utils/getLanguageFromPath';

interface MonacoEditorWrapperProps {
  filePath: string | null;
  content: string;
  onChange: (value: string) => void;
  externalUpdateKey: number;
}

export function MonacoEditorWrapper({
  filePath,
  content,
  onChange,
  externalUpdateKey,
}: MonacoEditorWrapperProps) {
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
      key={`${filePath}-${externalUpdateKey}`}
      height="100%"
      language={language}
      theme="vs-dark"
      value={content}
      onChange={(value) => onChange(value || '')}
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
