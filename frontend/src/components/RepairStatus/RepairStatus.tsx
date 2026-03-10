/**
 * RepairStatus component.
 * Displays visual feedback during the auto-repair process.
 */

import { Wrench, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';
import { useEffect, useState, useCallback, useRef } from 'react';
import './RepairStatus.css';

export type RepairPhase = 'idle' | 'detecting' | 'repairing' | 'success' | 'failed';

export interface RepairStatusProps {
  /** Current repair phase */
  phase: RepairPhase;
  /** Current repair attempt number */
  attempt?: number;
  /** Maximum repair attempts */
  maxAttempts?: number;
  /** Error message if failed */
  errorMessage?: string;
  /** File being repaired */
  currentFile?: string;
  /** Number of errors being fixed */
  errorCount?: number;
  /** Callback to dismiss the status */
  onDismiss?: () => void;
  /** Callback to view error details */
  onViewDetails?: () => void;
  /** Callback to retry repair after failure */
  onRetry?: () => void;
  /** Callback to revert to last working state */
  onRevert?: () => void;
  /** Auto-dismiss success after ms */
  autoDismissMs?: number;
}

/**
 * Toast-style component showing repair status.
 */
export function RepairStatus({
  phase,
  attempt = 1,
  maxAttempts = 3,
  errorMessage,
  currentFile,
  errorCount = 1,
  onDismiss,
  onViewDetails,
  onRetry,
  onRevert,
  autoDismissMs = 3000,
}: RepairStatusProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timer on unmount
  useEffect(() => () => {
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
  }, []);

  const handleExit = useCallback(() => {
    setIsExiting(true);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => {
      setIsVisible(false);
      onDismiss?.();
      exitTimerRef.current = null;
    }, 300); // Match CSS transition
  }, [onDismiss]);

  // Handle visibility transitions
  useEffect(() => {
    if (phase !== 'idle') {
      setIsVisible(true);
      setIsExiting(false);
    } else {
      handleExit();
    }
  }, [phase, handleExit]);

  // Auto-dismiss on success
  useEffect(() => {
    if (phase === 'success' && autoDismissMs > 0) {
      const timer = setTimeout(() => {
        handleExit();
      }, autoDismissMs);
      return () => clearTimeout(timer);
    }
  }, [phase, autoDismissMs, handleExit]);

  if (!isVisible) return null;

  const getIcon = () => {
    switch (phase) {
      case 'detecting':
        return <Loader2 className="repair-status-icon spin" size={18} />;
      case 'repairing':
        return <Wrench className="repair-status-icon pulse" size={18} />;
      case 'success':
        return <CheckCircle className="repair-status-icon success" size={18} />;
      case 'failed':
        return <AlertCircle className="repair-status-icon error" size={18} />;
      default:
        return null;
    }
  };

  const getMessage = () => {
    switch (phase) {
      case 'detecting':
        return `Detected ${errorCount} issue${errorCount > 1 ? 's' : ''}...`;
      case 'repairing':
        const attemptText = attempt > 1 ? ` (attempt ${attempt}/${maxAttempts})` : '';
        if (currentFile) {
          const shortPath = currentFile.split('/').pop() || currentFile;
          return `Fixing ${shortPath}...${attemptText}`;
        }
        return `Fixing issue${errorCount > 1 ? 's' : ''}...${attemptText}`;
      case 'success':
        return `Fixed successfully!`;
      case 'failed':
        return errorMessage || 'Unable to auto-fix. Manual intervention needed.';
      default:
        return '';
    }
  };

  const getPhaseClass = () => {
    switch (phase) {
      case 'detecting':
        return 'detecting';
      case 'repairing':
        return 'repairing';
      case 'success':
        return 'success';
      case 'failed':
        return 'failed';
      default:
        return '';
    }
  };

  return (
    <div
      className={`repair-status ${getPhaseClass()} ${isExiting ? 'exiting' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="repair-status-content">
        {getIcon()}
        <span className="repair-status-message">{getMessage()}</span>

        {phase === 'failed' && onRetry && (
          <button
            className="repair-status-action"
            onClick={onRetry}
            aria-label="Try repair again"
          >
            Try Again
          </button>
        )}

        {phase === 'failed' && onRevert && (
          <button
            className="repair-status-action"
            onClick={onRevert}
            aria-label="Revert to last working state"
          >
            Revert
          </button>
        )}

        {phase === 'failed' && onViewDetails && (
          <button
            className="repair-status-action"
            onClick={onViewDetails}
            aria-label="View error details"
          >
            View Details
          </button>
        )}

        {(phase === 'success' || phase === 'failed') && (
          <button
            className="repair-status-dismiss"
            onClick={handleExit}
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {phase === 'repairing' && (
        <div className="repair-status-progress">
          <div
            className="repair-status-progress-bar"
            style={{
              '--progress': `${(attempt / maxAttempts) * 100}%`
            } as React.CSSProperties}
          />
        </div>
      )}
    </div>
  );
}

export default RepairStatus;
