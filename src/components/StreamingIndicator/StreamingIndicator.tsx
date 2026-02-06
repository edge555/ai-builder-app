import React from 'react';
import type { StreamingState } from '@/hooks/useStreamingGeneration';
import './StreamingIndicator.css';

export interface StreamingIndicatorProps {
  state: StreamingState;
}

/**
 * Visual indicator showing real-time streaming progress.
 * Displays file names as they're generated.
 */
export function StreamingIndicator({ state }: StreamingIndicatorProps) {
  const { phase, currentFile, filesReceived, totalFiles, textLength } = state;

  if (phase === 'idle') return null;

  return (
    <div className="streaming-indicator" role="status" aria-live="polite">
      <div className="streaming-indicator-content">
        <div className="streaming-indicator-spinner">
          <div className="streaming-indicator-ring" />
        </div>
        
        <div className="streaming-indicator-info">
          <div className="streaming-indicator-phase">
            {phase === 'connecting' && 'Connecting...'}
            {phase === 'generating' && 'Generating code...'}
            {phase === 'processing' && 'Processing files...'}
            {phase === 'complete' && 'Complete!'}
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
              {filesReceived} / {totalFiles} files
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
      
      {phase === 'generating' && (
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
