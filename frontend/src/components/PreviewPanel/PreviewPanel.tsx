import React, { useState, useCallback, useMemo } from 'react';
import {
  SandpackProvider,
  SandpackLayout,
  SandpackPreview,
} from '@codesandbox/sandpack-react';
import { Code, Monitor } from 'lucide-react';
import type { SerializedProjectState } from '@/shared';
import type { LoadingPhase } from '../ChatInterface';
import { PreviewToolbar, type DeviceMode } from './PreviewToolbar';
import { PreviewSkeleton } from './PreviewSkeleton';
import { SandpackErrorListener } from './SandpackErrorListener';
import type { AggregatedErrors } from '@/services/ErrorAggregator';
import { CodeEditorView } from '../CodeEditor';
import { TabBar } from '../TabBar/TabBar';
import { BrowserChrome } from '../BrowserChrome/BrowserChrome';
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
  /** Callback when errors are detected and ready for repair */
  onErrorsReady?: (errors: AggregatedErrors) => void;
  /** Whether error monitoring is enabled */
  errorMonitoringEnabled?: boolean;
  /** Callback when bundler becomes idle (no errors) */
  onBundlerIdle?: () => void;
  /** Force code view (for mobile three-tab layout) */
  forceCodeView?: boolean;
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
 * PreviewPanel component that renders a live preview of the generated project.
 * Uses Sandpack to provide an isolated sandbox environment for React projects.
 * 
 * Requirements: 9.1, 9.2, 9.3
 */
export function PreviewPanel({
  projectState,
  isLoading = false,
  loadingPhase = 'idle',
  onErrorsReady,
  errorMonitoringEnabled = true,
  onBundlerIdle,
  forceCodeView = false,
}: PreviewPanelProps) {
  const [showCode, setShowCode] = useState(false);
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
  const [isRotated, setIsRotated] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Use forceCodeView when provided (for mobile three-tab layout)
  const effectiveShowCode = forceCodeView || showCode;

  // Refresh animation duration in milliseconds
  const REFRESH_ANIMATION_MS = 600;

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshKey(prev => prev + 1);
    setTimeout(() => setIsRefreshing(false), REFRESH_ANIMATION_MS);
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
    <div className="preview-panel">
      {/* Unified Header - combines tabs, browser controls, and device toolbar */}
      <div className="preview-unified-header">
        <TabBar
          tabs={[
            { id: 'preview', label: 'Preview', icon: <Monitor size={16} /> },
            { id: 'code', label: 'Code', icon: <Code size={16} /> },
          ]}
          activeTab={effectiveShowCode ? 'code' : 'preview'}
          onTabChange={(tabId) => setShowCode(tabId === 'code')}
        />

        {/* Browser controls and device toolbar - only shown in preview mode */}
        {!effectiveShowCode && (
          <>
            {/* Browser Chrome Controls */}
            {!isLoading && projectState && (
              <div className="preview-browser-controls">
                <button
                  className="preview-refresh-btn"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  aria-label="Refresh preview"
                  title="Refresh preview"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={isRefreshing ? 'spin' : ''}
                  >
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                  </svg>
                </button>

                <div className="preview-url-bar">
                  <svg
                    className="preview-url-lock"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  <span className="preview-url-protocol">https://</span>
                  <span className="preview-url-text">{projectState.name || 'preview'}.app/</span>
                </div>
              </div>
            )}

            {/* Device Toolbar */}
            <div className="preview-device-toolbar">
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
          </>
        )}
      </div>

      {/* Show skeleton during loading */}
      {isLoading && loadingPhase !== 'idle' ? (
        <PreviewSkeleton phase={loadingPhase} />
      ) : effectiveShowCode ? (
        <div className="preview-content" role="tabpanel" id="tabpanel-code">
          <CodeEditorView files={projectState?.files || {}} />
        </div>
      ) : (
        <div className="preview-content" role="tabpanel" id="tabpanel-preview">
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
            {/* Error listener for auto-repair */}
            {errorMonitoringEnabled && (
              <SandpackErrorListener
                onErrorsReady={onErrorsReady}
                enabled={!isLoading}
                onBundlerIdle={onBundlerIdle}
              />
            )}
            <SandpackLayout>
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
      )}

      {!projectState && !isLoading && (
        <div className="preview-placeholder">
          <p>Start by describing your application in the chat.</p>
        </div>
      )}
    </div>
  );
}

export default PreviewPanel;

