import type { SerializedProjectState } from '@ai-app-builder/shared/types';
import {
  SandpackProvider,
  SandpackLayout,
  SandpackPreview,
} from '@codesandbox/sandpack-react';
import { type ReactNode, useState, useCallback, useMemo, memo, useRef } from 'react';

import type { AggregatedErrors } from '@/services/ErrorAggregator';

import type { LoadingPhase } from '../ChatInterface/LoadingIndicator';
import { CodeEditorView } from '../CodeEditor';

import { EmptyProjectState } from '../EmptyProjectState/EmptyProjectState';
import { PreviewHeader } from './PreviewHeader';
import { PreviewSkeleton } from './PreviewSkeleton';
import { DEVICE_PRESETS } from './PreviewToolbar';
import {
  transformFilesForSandpack,
  hasRequiredFiles,
  DEFAULT_FILES,
  getEntryFile,
} from './previewUtils';
import { SandpackErrorListener } from './SandpackErrorListener';
import { SandpackRefresher } from './SandpackRefresher';
import './PreviewPanel.css';

/** Shared Sandpack dependency map. */
const SANDPACK_DEPS = {
  'react': '^18.2.0',
  'react-dom': '^18.2.0',
  'lucide-react': '^0.294.0',
  'clsx': '^2.0.0',
  'tailwind-merge': '^2.0.0',
};

/** Fixed frames shown in compare mode. */
const COMPARE_FRAMES = [
  { label: 'Mobile (375×667)',   width: 375,  height: 667  },
  { label: 'Tablet (768×1024)', width: 768,  height: 1024 },
  { label: 'Desktop',           width: 1280, height: 800  },
];

interface DeviceFrameProps {
  presetId: string;
  customWidth: number;
  customHeight: number;
  isRotated: boolean;
  zoom: number;
  children: ReactNode;
}

/** Renders a device-sized frame with zoom applied via CSS transform. */
function DeviceFrame({ presetId, customWidth, customHeight, isRotated, zoom, children }: DeviceFrameProps) {
  const preset = DEVICE_PRESETS.find(p => p.id === presetId);
  const baseW = presetId === 'custom' ? customWidth  : (preset?.width  ?? customWidth);
  const baseH = presetId === 'custom' ? customHeight : (preset?.height ?? customHeight);
  const w = isRotated ? baseH : baseW;
  const h = isRotated ? baseW : baseH;
  const scale = zoom / 100;

  return (
    <div
      className="device-frame"
      style={{
        width: w,
        height: h,
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: 'top center',
      }}
    >
      {children}
    </div>
  );
}

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
  const [presetId, setPresetId] = useState('desktop');
  const [customWidth, setCustomWidth] = useState(375);
  const [customHeight, setCustomHeight] = useState(667);
  const [isRotated, setIsRotated] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [compareMode, setCompareMode] = useState(false);
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
    <div className="preview-panel" role="region" aria-label="Application preview">
      <PreviewHeader
        showCode={effectiveShowCode}
        onViewChange={setShowCode}
        toolbarProps={{
          presetId,
          customWidth,
          customHeight,
          isRotated,
          zoom,
          compareMode,
          onPresetChange: (id) => { setPresetId(id); setIsRotated(false); },
          onCustomDimensionChange: (w, h) => { setCustomWidth(w); setCustomHeight(h); },
          onRotate: () => setIsRotated(prev => !prev),
          onZoomChange: setZoom,
          onCompareModeChange: setCompareMode,
        }}
        isLoading={isLoading}
        projectState={projectState}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
      />

      {/* Show skeleton during loading */}
      {isLoading && loadingPhase !== 'idle' ? (
        <PreviewSkeleton phase={loadingPhase} />
      ) : !projectState && !isLoading ? (
        <EmptyProjectState />
      ) : effectiveShowCode ? (
        <div className="preview-content" role="tabpanel" id="tabpanel-code" aria-label="Code editor">
          <CodeEditorView files={projectState?.files || {}} />
        </div>
      ) : (
        <div className="preview-content" role="tabpanel" id="tabpanel-preview" aria-label="Live preview">
          {compareMode ? (
            /* ── Compare mode: three fixed-size frames side by side ── */
            <div className="device-compare-container">
              {COMPARE_FRAMES.map(frame => (
                <div key={frame.label} className="device-compare-frame">
                  <div className="device-compare-label">{frame.label}</div>
                  <SandpackProvider
                    files={Object.fromEntries(
                      Object.entries(sandpackFiles).map(([path, code]) => [path, { code }])
                    )}
                    theme="dark"
                    options={{ activeFile: entryFile, recompileMode: 'delayed', recompileDelay: 500, visibleFiles: Object.keys(sandpackFiles) }}
                    customSetup={{ entry: entryFile, dependencies: SANDPACK_DEPS }}
                  >
                    <SandpackLayout>
                      <div className="device-frame" style={{ width: frame.width, height: frame.height }}>
                        <SandpackPreview showOpenInCodeSandbox={false} showRefreshButton style={{ height: '100%' }} />
                      </div>
                    </SandpackLayout>
                  </SandpackProvider>
                </div>
              ))}
            </div>
          ) : (
            /* ── Normal single-device mode ── */
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
              customSetup={{ entry: entryFile, dependencies: SANDPACK_DEPS }}
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
                {presetId === 'desktop' ? (
                  <SandpackPreview
                    showOpenInCodeSandbox={true}
                    showRefreshButton
                    style={{ height: '100%' }}
                  />
                ) : (
                  <div className="device-simulation-container">
                    <DeviceFrame
                      presetId={presetId}
                      customWidth={customWidth}
                      customHeight={customHeight}
                      isRotated={isRotated}
                      zoom={zoom}
                    >
                      <SandpackPreview
                        showOpenInCodeSandbox={true}
                        showRefreshButton
                        style={{ height: '100%' }}
                      />
                    </DeviceFrame>
                  </div>
                )}
              </SandpackLayout>
            </SandpackProvider>
          )}
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

