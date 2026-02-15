import type { SerializedProjectState } from '@ai-app-builder/shared/types';
import { Code, Monitor } from 'lucide-react';

import { TabBar } from '../TabBar/TabBar';

import { PreviewToolbar, type DeviceMode } from './PreviewToolbar';
import './PreviewPanel.css';

export interface PreviewHeaderProps {
  /** Whether to show code view */
  showCode: boolean;
  /** Callback when view changes */
  onViewChange: (showCode: boolean) => void;
  /** Current device mode */
  deviceMode: DeviceMode;
  /** Whether device is rotated */
  isRotated: boolean;
  /** Callback when device mode changes */
  onModeChange: (mode: DeviceMode) => void;
  /** Callback when rotation toggles */
  onRotate: () => void;
  /** Whether content is loading */
  isLoading: boolean;
  /** Current project state */
  projectState: SerializedProjectState | null;
  /** Whether refresh is in progress */
  isRefreshing: boolean;
  /** Callback when refresh button clicked */
  onRefresh: () => void;
}

/**
 * Unified header for PreviewPanel containing tabs, browser controls, and device toolbar.
 */
export function PreviewHeader({
  showCode,
  onViewChange,
  deviceMode,
  isRotated,
  onModeChange,
  onRotate,
  isLoading,
  projectState,
  isRefreshing,
  onRefresh,
}: PreviewHeaderProps) {
  return (
    <div className="preview-unified-header">
      <TabBar
        tabs={[
          { id: 'preview', label: 'Preview', icon: <Monitor size={16} /> },
          { id: 'code', label: 'Code', icon: <Code size={16} /> },
        ]}
        activeTab={showCode ? 'code' : 'preview'}
        onTabChange={(tabId) => onViewChange(tabId === 'code')}
      />

      {/* Browser controls and device toolbar - only shown in preview mode */}
      {!showCode && (
        <>
          {/* Browser Chrome Controls */}
          {!isLoading && projectState && (
            <div className="preview-browser-controls">
              <button
                className="preview-refresh-btn"
                onClick={onRefresh}
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
                onModeChange(mode);
              }}
              onRotate={onRotate}
            />
          </div>
        </>
      )}
    </div>
  );
}
