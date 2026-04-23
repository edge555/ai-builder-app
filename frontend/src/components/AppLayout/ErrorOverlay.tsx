/**
 * ErrorOverlay component.
 * Displays repair status independently from PreviewSection.
 * Subscribes only to error state to avoid unnecessary re-renders of preview.
 */

import { useCallback, useState } from 'react';

import { RepairStatus } from '@/components/RepairStatus';
import { usePreviewErrorState, usePreviewErrorActions, useProjectActions } from '@/context';
import './ErrorOverlay.css';

/**
 * Overlay component that displays error/repair status and collapsible error details.
 * Separated from PreviewSection to prevent error state changes from re-rendering the preview.
 */
export function ErrorOverlay() {
  const {
    repairPhase,
    repairAttempts,
    maxRepairAttempts,
    aggregatedErrors,
    errorQueue,
    repairExplanation,
  } = usePreviewErrorState();

  const { dismissRepairStatus, resetRepairAttempts, setRepairPhase } = usePreviewErrorActions();
  const { undo } = useProjectActions();

  const [showDetails, setShowDetails] = useState(false);

  // Reset attempts and re-enter repairing phase; AutoRepairProvider will pick it up
  const handleRetry = useCallback(() => {
    setShowDetails(false);
    resetRepairAttempts();
    setRepairPhase('repairing');
  }, [resetRepairAttempts, setRepairPhase]);

  const handleRevert = useCallback(() => {
    undo();
    dismissRepairStatus();
    setShowDetails(false);
  }, [undo, dismissRepairStatus]);

  const handleDismiss = useCallback(() => {
    setShowDetails(false);
    dismissRepairStatus();
  }, [dismissRepairStatus]);

  // Get current file being repaired for display
  const currentFile = aggregatedErrors?.affectedFiles[0];

  return (
    <div className="error-overlay-wrapper">
      <RepairStatus
        phase={repairPhase}
        attempt={repairAttempts}
        maxAttempts={maxRepairAttempts}
        errorCount={aggregatedErrors?.totalCount || 1}
        currentFile={currentFile}
        onDismiss={handleDismiss}
        onRetry={handleRetry}
        onRevert={handleRevert}
        onViewDetails={() => setShowDetails(prev => !prev)}
      />

      {repairPhase === 'success' && repairExplanation && (
        <div className="error-overlay-details">
          <div className="error-overlay-details-body">
            <div className="error-overlay-detail-section">
              <span className="error-overlay-detail-label">What was fixed</span>
              <p className="error-overlay-detail-message error-overlay-detail-message--success">{repairExplanation}</p>
            </div>
          </div>
        </div>
      )}

      {showDetails && repairPhase === 'failed' && (
        <div className="error-overlay-details">
          <div className="error-overlay-details-header">
            <span>Error Details</span>
            <button
              className="error-overlay-details-close"
              onClick={() => setShowDetails(false)}
              aria-label="Close details"
            >
              ×
            </button>
          </div>
          <div className="error-overlay-details-body">
            {/* Human-readable summary first */}
            <div className="error-overlay-detail-section">
              <p className="error-overlay-detail-message">
                Something went wrong{currentFile ? ` in ${currentFile}` : ' in your app'}.
                {' '}Try a simpler request, or use <strong>Undo</strong> to go back to the last working version.
              </p>
            </div>

            {aggregatedErrors?.affectedFiles && aggregatedErrors.affectedFiles.length > 0 && (
              <div className="error-overlay-detail-section">
                <span className="error-overlay-detail-label">Affected files</span>
                <ul className="error-overlay-detail-files">
                  {aggregatedErrors.affectedFiles.map(f => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Raw technical details behind a toggle */}
            <details className="error-overlay-technical-details">
              <summary className="error-overlay-technical-summary">Show technical details</summary>
              {errorQueue.slice(-3).map((err, i) => (
                <div key={i} className="error-overlay-detail-section">
                  <span className="error-overlay-detail-label">{err.type}</span>
                  <p className="error-overlay-detail-message">{err.message}</p>
                  {err.stack && (
                    <pre className="error-overlay-detail-stack">{err.stack.slice(0, 400)}</pre>
                  )}
                </div>
              ))}
            </details>
          </div>
        </div>
      )}
    </div>
  );
}
