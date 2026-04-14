import type { SerializedProjectState } from '@ai-app-builder/shared/types';
import { type ReactNode, useState, useCallback, useMemo, memo, useRef, useEffect } from 'react';

import type { AggregatedErrors } from '@/services/ErrorAggregator';
import { useWebContainer } from '@/hooks/useWebContainer';

import type { LoadingPhase } from '../ChatInterface/LoadingIndicator';
import { CodeEditorView } from '../CodeEditor';
import { EmptyProjectState } from '../EmptyProjectState/EmptyProjectState';
import { PreviewHeader } from './PreviewHeader';
import { PreviewSkeleton } from './PreviewSkeleton';
import { DEVICE_PRESETS } from './PreviewToolbar';
import { detectFullstackProject } from './previewUtils';
import { FullstackBanner } from './FullstackBanner';
import { WebContainerBootProgress } from './WebContainerBootProgress';
import { WebContainerPreview } from './WebContainerPreview';
import { WebContainerConsole } from './WebContainerConsole';
import { WebContainerErrorListener } from './WebContainerErrorListener';
import './PreviewPanel.css';

/** Fixed frames shown in compare mode. */
const COMPARE_FRAMES = [
  { label: 'Mobile (375\u00d7667)',   width: 375,  height: 667  },
  { label: 'Tablet (768\u00d71024)', width: 768,  height: 1024 },
  { label: 'Desktop',                width: 1280, height: 800  },
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
 * Uses WebContainers to provide a real Node.js runtime inside the browser.
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
  const [showConsole, setShowConsole] = useState(false);

  // Use forceCodeView when provided (for mobile three-tab layout)
  const effectiveShowCode = forceCodeView || showCode;

  // Detect fullstack project for banner display
  const fullstackInfo = useMemo(
    () => detectFullstackProject(projectState?.files ?? {}),
    [projectState?.files]
  );

  // WebContainer lifecycle
  const {
    phase,
    previewUrl,
    installOutput,
    serverOutput,
    terminalLines,
    refresh,
  } = useWebContainer(projectState?.files ?? null);

  // Notify parent when WebContainer reaches ready phase
  const onBundlerIdleRef = useRef(onBundlerIdle);
  useEffect(() => {
    onBundlerIdleRef.current = onBundlerIdle;
  }, [onBundlerIdle]);

  const prevPhaseRef = useRef(phase);
  useEffect(() => {
    if (phase === 'ready' && prevPhaseRef.current !== 'ready') {
      onBundlerIdleRef.current?.();
    }
    prevPhaseRef.current = phase;
  }, [phase]);

  // Refresh animation duration in milliseconds
  const REFRESH_ANIMATION_MS = 600;

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refresh();
    setTimeout(() => setIsRefreshing(false), REFRESH_ANIMATION_MS);
  }, [refresh]);

  const isBooting = phase !== 'ready' && phase !== 'idle' && phase !== 'error';

  return (
    <div className="preview-panel" role="region" aria-label="Application preview">
      <PreviewHeader
        showCode={effectiveShowCode}
        onViewChange={setShowCode}
        showConsole={showConsole}
        onToggleConsole={() => setShowConsole(prev => !prev)}
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

      {/* Show skeleton during AI generation */}
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
          {/* Error listener for auto-repair */}
          {errorMonitoringEnabled && (
            <WebContainerErrorListener
              serverOutput={serverOutput}
              installOutput={installOutput}
              onErrorsReady={onErrorsReady}
              enabled={!isLoading}
              onBundlerIdle={onBundlerIdle}
              isReady={phase === 'ready'}
            />
          )}

          {fullstackInfo.isFullstack && (
            <FullstackBanner
              hasPrisma={fullstackInfo.hasPrisma}
              hasApiRoutes={fullstackInfo.hasApiRoutes}
            />
          )}

          {compareMode ? (
            /* ── Compare mode: three fixed-size frames side by side ── */
            <div className="device-compare-container">
              {COMPARE_FRAMES.map(frame => (
                <div key={frame.label} className="device-compare-frame">
                  <div className="device-compare-label">{frame.label}</div>
                  <div className="device-frame" style={{ width: frame.width, height: frame.height, position: 'relative' }}>
                    {isBooting && (
                      <WebContainerBootProgress phase={phase} installOutput={installOutput} />
                    )}
                    <WebContainerPreview
                      previewUrl={previewUrl}
                      phase={phase}
                      style={{ width: '100%', height: '100%' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* ── Normal single-device mode ── */
            <>
              {presetId === 'desktop' ? (
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                  {isBooting && (
                    <WebContainerBootProgress phase={phase} installOutput={installOutput} />
                  )}
                  <WebContainerPreview
                    previewUrl={previewUrl}
                    phase={phase}
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
              ) : (
                <div className="device-simulation-container">
                  <DeviceFrame
                    presetId={presetId}
                    customWidth={customWidth}
                    customHeight={customHeight}
                    isRotated={isRotated}
                    zoom={zoom}
                  >
                    {isBooting && (
                      <WebContainerBootProgress phase={phase} installOutput={installOutput} />
                    )}
                    <WebContainerPreview
                      previewUrl={previewUrl}
                      phase={phase}
                      style={{ width: '100%', height: '100%' }}
                    />
                  </DeviceFrame>
                </div>
              )}

              {showConsole && (
                <div className="preview-console-panel">
                  <WebContainerConsole lines={terminalLines} />
                </div>
              )}
            </>
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
 */
export const PreviewPanel = memo(PreviewPanelComponent, arePropsEqual);

export default PreviewPanel;
