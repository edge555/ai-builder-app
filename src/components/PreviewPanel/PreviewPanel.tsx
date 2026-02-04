import React, { useState, useCallback, useMemo, forwardRef } from 'react';
import {
  SandpackProvider,
  SandpackLayout,
  SandpackPreview,
  SandpackCodeEditor,
  SandpackFileExplorer,
} from '@codesandbox/sandpack-react';
import { RefreshCw, Code, EyeOff } from 'lucide-react';
import type { SerializedProjectState } from '@/shared';
import type { LoadingPhase } from '../ChatInterface';
import { PreviewToolbar, type DeviceMode } from './PreviewToolbar';
import { PreviewSkeleton } from './PreviewSkeleton';
import './PreviewPanel.css';

/**
 * Props for the PreviewPanel component.
 */
export interface PreviewPanelProps {
  /** The current project state containing files to preview */
  projectState: SerializedProjectState | null;
  /** Whether content is currently being generated/modified */
  isLoading?: boolean;
  /** Current loading phase for skeleton display */
  loadingPhase?: LoadingPhase;
  /** Callback when a preview error occurs */
  onError?: (error: Error) => void;
}

/**
 * Transforms project files to Sandpack-compatible format.
 * Sandpack expects files with leading slashes and without folder prefixes like 'frontend/'.
 */
function transformFilesForSandpack(
  files: Record<string, string>
): Record<string, string> {
  const sandpackFiles: Record<string, string> = {};

  for (const [path, content] of Object.entries(files)) {
    // Remove 'frontend/' prefix if present (generated projects have frontend/backend structure)
    let cleanPath = path.replace(/^frontend\//, '');

    // Ensure paths start with /
    const sandpackPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
    sandpackFiles[sandpackPath] = content;
  }

  return sandpackFiles;
}

/**
 * Checks if the project has the minimum required files for React preview.
 */
function hasRequiredFiles(files: Record<string, string>): boolean {
  const paths = Object.keys(files);
  const hasAppOrIndex = paths.some(
    (p) => p.includes('App.tsx') || p.includes('App.jsx') ||
      p.includes('index.tsx') || p.includes('index.jsx') ||
      p.includes('main.tsx') || p.includes('main.jsx')
  );
  return hasAppOrIndex;
}

/**
 * Default files for an empty preview state.
 */
const DEFAULT_FILES = {
  '/App.tsx': `export default function App() {
  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui' }}>
      <h1>Welcome to AI App Builder</h1>
      <p>Describe your application in the chat to get started.</p>
    </div>
  );
}`,
  '/index.tsx': `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);`,
};


/**
 * Error boundary state for catching preview errors.
 */
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component for catching Sandpack errors.
 */
class PreviewErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: (error: Error) => void },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; onError?: (error: Error) => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error): void {
    this.props.onError?.(error);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="preview-error">
          <h3>Preview Error</h3>
          <p>{this.state.error?.message || 'An error occurred while rendering the preview.'}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * PreviewPanel component that renders a live preview of the generated project.
 * Uses Sandpack to provide an isolated sandbox environment for React projects.
 * 
 * Requirements: 9.1, 9.2, 9.3
 */
export const PreviewPanel = forwardRef<HTMLDivElement, PreviewPanelProps>(function PreviewPanel({ projectState, isLoading = false, loadingPhase = 'idle', onError }, ref) {
  const [showCode, setShowCode] = useState(false);
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
  const [isRotated, setIsRotated] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshKey(prev => prev + 1);
    setTimeout(() => setIsRefreshing(false), 600);
  }, []);

  const handleError = useCallback((error: Error) => {
    setPreviewError(error.message);
    onError?.(error);
  }, [onError]);

  const clearError = useCallback(() => {
    setPreviewError(null);
  }, []);

  // Transform project files for Sandpack
  const sandpackFiles = useMemo(() => {
    if (!projectState || Object.keys(projectState.files).length === 0) {
      return DEFAULT_FILES;
    }

    const transformed = transformFilesForSandpack(projectState.files);

    // If project doesn't have required entry files, use defaults
    if (!hasRequiredFiles(transformed)) {
      return { ...DEFAULT_FILES, ...transformed };
    }

    return transformed;
  }, [projectState]);

  // Determine the entry file
  const entryFile = useMemo(() => {
    const paths = Object.keys(sandpackFiles);

    // Look for common entry points
    const entryPoints = ['/src/main.tsx', '/src/index.tsx', '/main.tsx', '/index.tsx'];
    for (const entry of entryPoints) {
      if (paths.includes(entry)) {
        return entry;
      }
    }

    // Fallback to App.tsx
    const appFile = paths.find(p => p.includes('App.tsx') || p.includes('App.jsx'));
    return appFile || '/App.tsx';
  }, [sandpackFiles]);

  return (
    <div className="preview-panel" ref={ref}>
      <div className="preview-header">
        <div className="preview-header-left">
          <h2>Preview</h2>
          {projectState?.name && <span className="preview-project-name">{projectState.name}</span>}
        </div>

        <div className="preview-header-center">
          <PreviewToolbar
            currentMode={deviceMode}
            isRotated={isRotated}
            onModeChange={(mode) => {
              setDeviceMode(mode);
              setIsRotated(false); // Reset rotation on mode change
            }}
            onRotate={() => setIsRotated(!isRotated)}
          />
        </div>

        <div className="preview-header-right preview-controls">
          <button
            className={`toggle-code-btn refresh-btn ${isRefreshing ? 'refreshing' : ''}`}
            onClick={handleRefresh}
            title="Refresh Preview"
            aria-label="Refresh preview"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin-slow' : ''} />
            <span>Refresh</span>
          </button>
          <button
            className={`toggle-code-btn ${showCode ? 'active' : ''}`}
            onClick={() => setShowCode(!showCode)}
            aria-label={showCode ? 'Hide code panel' : 'Show code panel'}
          >
            {showCode ? <EyeOff size={14} /> : <Code size={14} />}
            <span>{showCode ? 'Hide Code' : 'Show Code'}</span>
          </button>
        </div>
      </div>

      {previewError && (
        <div className="preview-error-banner">
          <span>{previewError}</span>
          <button onClick={clearError}>Dismiss</button>
        </div>
      )}

      {/* Show skeleton during loading */}
      {isLoading && loadingPhase !== 'idle' ? (
        <PreviewSkeleton phase={loadingPhase} />
      ) : (
        <PreviewErrorBoundary onError={handleError}>
          <div className="preview-content">
            <SandpackProvider
              key={refreshKey}
              files={Object.fromEntries(
                Object.entries(sandpackFiles).map(([path, code]) => [path, { code }])
              )}
              theme="dark"
              options={{
                activeFile: entryFile,
                recompileMode: 'delayed',
                recompileDelay: 500,
                visibleFiles: Object.keys(sandpackFiles),
              }}
              customSetup={{
                entry: entryFile,
                dependencies: {
                  'react': '^18.2.0',
                  'react-dom': '^18.2.0',
                  'lucide-react': '^0.294.0',
                  'clsx': '^2.0.0',
                  'tailwind-merge': '^2.0.0',
                },
              }}
            >
              <SandpackLayout>
                {showCode && (
                  <>
                    <SandpackFileExplorer
                      autoHiddenFiles
                    />
                    <SandpackCodeEditor
                      showTabs={false}
                      showLineNumbers
                      showInlineErrors
                      wrapContent
                      style={{ height: '100%' }}
                    />
                  </>
                )}
                {deviceMode === 'desktop' ? (
                  <SandpackPreview
                    showOpenInCodeSandbox={false}
                    showRefreshButton
                    style={{ height: '100%' }}
                  />
                ) : (
                  <div className="device-simulation-container">
                    <div className={`device-frame ${deviceMode} ${isRotated ? 'rotated' : ''}`}>
                      <SandpackPreview
                        showOpenInCodeSandbox={false}
                        showRefreshButton
                        style={{ height: '100%' }}
                      />
                    </div>
                  </div>
                )}
              </SandpackLayout>
            </SandpackProvider>
          </div>
        </PreviewErrorBoundary>
      )}

      {!projectState && !isLoading && (
        <div className="preview-placeholder">
          <p>Start by describing your application in the chat.</p>
        </div>
      )}
    </div>
  );
});

export default PreviewPanel;

