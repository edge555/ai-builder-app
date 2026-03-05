import { useState } from 'react';

import type { StreamingState } from '@/context';

import './StreamingIndicator.css';

export interface StreamingIndicatorProps {
  state: StreamingState;
}

/**
 * Visual indicator showing real-time streaming progress.
 * Displays file names as they're generated with heartbeat status.
 */
export function StreamingIndicator({ state }: StreamingIndicatorProps) {
  const { phase, progressLabel, currentFile, filesReceived, totalFiles, textLength, lastHeartbeat, warnings, summary } = state;
  const [showWarnings, setShowWarnings] = useState(false);

  if (phase === 'idle') return null;

  // Calculate time since last heartbeat
  const timeSinceHeartbeat = lastHeartbeat ? Date.now() - lastHeartbeat : 0;
  const isConnectionHealthy = timeSinceHeartbeat < 15000; // Warn if no heartbeat for 15s

  return (
    <div className="streaming-indicator" role="status" aria-live="polite">
      <div className="streaming-indicator-content">
        <div className="streaming-indicator-spinner">
          <div className="streaming-indicator-ring" />
        </div>

        <div className="streaming-indicator-info">
          <div className="streaming-indicator-phase">
            {phase === 'connecting' && 'Connecting to AI...'}
            {phase === 'generating' && (progressLabel || 'AI is generating code...')}
            {phase === 'processing' && 'Receiving files...'}
            {phase === 'complete' && 'Generation complete!'}
            {phase === 'error' && 'Error occurred'}
          </div>

          {phase === 'generating' && textLength > 0 && (
            <div className="streaming-indicator-detail">
              {Math.round(textLength / 100) * 100}+ characters generated
            </div>
          )}

          {phase === 'processing' && currentFile && (
            <div className="streaming-indicator-detail streaming-indicator-file">
              <span className="streaming-indicator-file-icon">📄</span>
              <span className="streaming-indicator-file-path">{currentFile}</span>
            </div>
          )}

          {totalFiles > 0 && (
            <div className="streaming-indicator-progress-text">
              {filesReceived} / {totalFiles} files received
            </div>
          )}

          {!isConnectionHealthy && phase !== 'complete' && phase !== 'error' && (
            <div className="streaming-indicator-warning">
              Connection may be slow...
            </div>
          )}

          {warnings.length > 0 && (
            <>
              <button
                className="streaming-indicator-warnings"
                onClick={() => setShowWarnings(!showWarnings)}
                type="button"
                aria-expanded={showWarnings}
              >
                <span className="streaming-indicator-warning-icon">⚠️</span>
                <span>{warnings.length} warning{warnings.length > 1 ? 's' : ''}</span>
                <span className="streaming-indicator-expand-icon">{showWarnings ? '▼' : '▶'}</span>
              </button>
              {showWarnings && (
                <div className="streaming-indicator-warning-list">
                  {warnings.map((warning, index) => (
                    <div key={index} className="streaming-indicator-warning-item">
                      <div className="streaming-indicator-warning-path">{warning.path}</div>
                      <div className="streaming-indicator-warning-message">{warning.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {summary && (
            <div className="streaming-indicator-summary">
              {summary.failedFiles > 0 && (
                <span className="streaming-indicator-failed">
                  {summary.failedFiles} file{summary.failedFiles > 1 ? 's' : ''} incomplete
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {totalFiles > 0 && (
        <div className="streaming-indicator-progress">
          <div
            className="streaming-indicator-progress-bar"
            style={{ width: `${(filesReceived / totalFiles) * 100}%` }}
          />
        </div>
      )}

      {(phase === 'generating' || phase === 'processing') && (
        <div className="streaming-indicator-dots">
          <span className="streaming-dot" />
          <span className="streaming-dot" />
          <span className="streaming-dot" />
        </div>
      )}
    </div>
  );
}

export default StreamingIndicator;
