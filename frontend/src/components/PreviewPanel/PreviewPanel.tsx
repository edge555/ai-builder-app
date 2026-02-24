import type { SerializedProjectState } from '@ai-app-builder/shared/types';
import {
  SandpackProvider,
  SandpackLayout,
  SandpackPreview,
} from '@codesandbox/sandpack-react';
import { useState, useCallback, useMemo, memo, useRef } from 'react';

import type { AggregatedErrors } from '@/services/ErrorAggregator';

import type { LoadingPhase } from '../ChatInterface/LoadingIndicator';
import { CodeEditorView } from '../CodeEditor';

import { PreviewHeader } from './PreviewHeader';
import { PreviewSkeleton } from './PreviewSkeleton';
import { type DeviceMode } from './PreviewToolbar';
import {
  transformFilesForSandpack,
  hasRequiredFiles,
  DEFAULT_FILES,
  getEntryFile,
} from './previewUtils';
import { SandpackErrorListener } from './SandpackErrorListener';
import { SandpackRefresher } from './SandpackRefresher';
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
 * PreviewPanel component that renders a live preview of the generated project.
 * Uses Sandpack to provide an isolated sandbox environment for React projects.
 *
 * Requirements: 9.1, 9.2, 9.3
 */
const PreviewPanelComponent = function PreviewPanel({
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
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Use forceCodeView when provided (for mobile three-tab layout)
  const effectiveShowCode = forceCodeView || showCode;

  // Dispatch-based refresh: SandpackRefresher provides this function once mounted.
  const refreshFnRef = useRef<(() => void) | null>(null);

  // Refresh animation duration in milliseconds
  const REFRESH_ANIMATION_MS = 600;

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    refreshFnRef.current?.();
    setTimeout(() => setIsRefreshing(false), REFRESH_ANIMATION_MS);
  }, []);

  // Track previous files for deep equality check
  const prevFilesRef = useRef<Record<string, string> | null>(null);
  const cachedSandpackFilesRef = useRef<Record<string, string>>(DEFAULT_FILES);

  // Transform project files for Sandpack
  // Only recompute if files actually changed (deep equality)
  const sandpackFiles = useMemo(() => {
    const currentFiles = projectState?.files;

    if (!currentFiles || Object.keys(currentFiles).length === 0) {
      prevFilesRef.current = null;
      cachedSandpackFilesRef.current = DEFAULT_FILES;
      return DEFAULT_FILES;
    }

    // Deep equality check: only recompute if files changed
    const filesChanged = !prevFilesRef.current ||
      Object.keys(currentFiles).length !== Object.keys(prevFilesRef.current).length ||
      Object.keys(currentFiles).some(key => currentFiles[key] !== prevFilesRef.current![key]);

    if (!filesChanged) {
      return cachedSandpackFilesRef.current;
    }

    // Files changed, recompute
    prevFilesRef.current = currentFiles;
    const transformed = transformFilesForSandpack(currentFiles);

    // If project doesn't have required entry files, use defaults
    if (!hasRequiredFiles(transformed)) {
      cachedSandpackFilesRef.current = { ...DEFAULT_FILES, ...transformed };
      return cachedSandpackFilesRef.current;
    }

    cachedSandpackFilesRef.current = transformed;
    return transformed;
  }, [projectState?.files]);

  // Determine the entry file
  const entryFile = useMemo(() => getEntryFile(sandpackFiles), [sandpackFiles]);

  return (
    <div className="preview-panel">
      <PreviewHeader
        showCode={effectiveShowCode}
        onViewChange={setShowCode}
        deviceMode={deviceMode}
        isRotated={isRotated}
        onModeChange={(mode) => {
          setDeviceMode(mode);
          setIsRotated(false); // Reset rotation on mode change
        }}
        onRotate={() => setIsRotated(!isRotated)}
        isLoading={isLoading}
        projectState={projectState}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
      />

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
              {/* Dispatch-based refresh — no iframe remount */}
              <SandpackRefresher onRefreshReady={(fn) => { refreshFnRef.current = fn; }} />
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
};

/**
 * Custom comparator for PreviewPanel memoization.
 * Only re-render when relevant props actually change.
 */
function arePropsEqual(
  prevProps: Readonly<PreviewPanelProps>,
  nextProps: Readonly<PreviewPanelProps>
): boolean {
  // Compare primitive props
  if (
    prevProps.isLoading !== nextProps.isLoading ||
    prevProps.loadingPhase !== nextProps.loadingPhase ||
    prevProps.errorMonitoringEnabled !== nextProps.errorMonitoringEnabled ||
    prevProps.forceCodeView !== nextProps.forceCodeView
  ) {
    return false;
  }

  // Compare callbacks (reference equality is fine for stable callbacks)
  if (
    prevProps.onErrorsReady !== nextProps.onErrorsReady ||
    prevProps.onBundlerIdle !== nextProps.onBundlerIdle
  ) {
    return false;
  }

  // Deep compare project files (not entire projectState)
  const prevFiles = prevProps.projectState?.files;
  const nextFiles = nextProps.projectState?.files;

  if (prevFiles === nextFiles) {
    return true; // Same reference
  }

  if (!prevFiles || !nextFiles) {
    return prevFiles === nextFiles; // Both null/undefined
  }

  // Compare file keys and contents
  const prevKeys = Object.keys(prevFiles);
  const nextKeys = Object.keys(nextFiles);

  if (prevKeys.length !== nextKeys.length) {
    return false;
  }

  // Check if all files are the same
  return prevKeys.every(key => prevFiles[key] === nextFiles[key]);
}

/**
 * Memoized PreviewPanel - only re-renders when files or relevant props change.
 * Sandpack is expensive to reinitialize, so this prevents unnecessary updates.
 */
export const PreviewPanel = memo(PreviewPanelComponent, arePropsEqual);

export default PreviewPanel;

