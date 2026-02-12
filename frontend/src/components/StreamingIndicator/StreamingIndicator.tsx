import React from 'react';
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
  const { phase, currentFile, filesReceived, totalFiles, textLength, lastHeartbeat } = state;

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
            {phase === 'generating' && 'AI is generating code...'}
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
