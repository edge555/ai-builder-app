import React, { useMemo } from 'react';
import type { SerializedVersion, FileDiff } from '@/shared';
import './HistoryPanel.css';

/**
 * Props for the HistoryPanel component.
 */
export interface HistoryPanelProps {
  /** Array of versions to display */
  versions: SerializedVersion[];
  /** ID of the current version */
  currentVersionId: string | null;
  /** Callback when user clicks revert on a version */
  onRevert: (versionId: string) => void;
  /** Whether a revert operation is in progress */
  isLoading?: boolean;
  /** Error message to display */
  error?: string | null;
  /** Callback to retry loading versions */
  onRetry?: () => void;
}

/**
 * Computes diff statistics from a version's diffs.
 */
function computeVersionStats(diffs: FileDiff[]) {
  let linesAdded = 0;
  let linesDeleted = 0;
  let filesChanged = diffs.length;

  for (const diff of diffs) {
    for (const hunk of diff.hunks) {
      for (const change of hunk.changes) {
        if (change.type === 'add') linesAdded++;
        if (change.type === 'delete') linesDeleted++;
      }
    }
  }

  return { linesAdded, linesDeleted, filesChanged };
}

/**
 * Formats a timestamp for display.
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * History Panel component for displaying version timeline.
 * Shows prompt and timestamp for each version with revert buttons.
 * 
 * Requirements: 6.3
 */
export function HistoryPanel({
  versions,
  currentVersionId,
  onRevert,
  isLoading = false,
  error = null,
  onRetry,
}: HistoryPanelProps) {
  // Sort versions by timestamp (newest first)
  const sortedVersions = useMemo(() => {
    return [...versions].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [versions]);

  if (isLoading) {
    return (
      <div className="history-panel" role="region" aria-label="Version history">
        <div className="history-panel-header">
          <span className="history-panel-title">History</span>
        </div>
        <div className="history-loading" role="status" aria-label="Loading history">
          <div className="history-loading-spinner" />
          <span>Loading history...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="history-panel" role="region" aria-label="Version history">
        <div className="history-panel-header">
          <span className="history-panel-title">History</span>
        </div>
        <div className="history-error" role="alert">
          <span className="history-error-icon">⚠️</span>
          <span className="history-error-text">{error}</span>
          {onRetry && (
            <button className="history-retry-button" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="history-panel" role="region" aria-label="Version history">
      <div className="history-panel-header">
        <span className="history-panel-title">
          History
          <span className="history-panel-count">({versions.length})</span>
        </span>
      </div>

      <div className="history-timeline">
        {sortedVersions.length === 0 ? (
          <div className="history-empty-state">
            <span className="history-empty-state-icon">📜</span>
            <span className="history-empty-state-text">
              No version history yet. Generate a project to get started.
            </span>
          </div>
        ) : (
          sortedVersions.map((version, index) => (
            <VersionItem
              key={version.id}
              version={version}
              isCurrent={version.id === currentVersionId}
              isInitial={version.parentVersionId === null}
              isNewest={index === 0}
              onRevert={onRevert}
              isLoading={isLoading}
            />
          ))
        )}
      </div>
    </div>
  );
}


/**
 * Props for the VersionItem component.
 */
interface VersionItemProps {
  version: SerializedVersion;
  isCurrent: boolean;
  isInitial: boolean;
  isNewest: boolean;
  onRevert: (versionId: string) => void;
  isLoading?: boolean;
}

/**
 * Renders a single version in the timeline.
 */
const VersionItem = React.memo(function VersionItem({ version, isCurrent, isInitial, isNewest, onRevert, isLoading = false }: VersionItemProps) {
  const stats = useMemo(() => computeVersionStats(version.diffs), [version.diffs]);
  
  const versionClass = [
    'history-version',
    isCurrent ? 'history-version-current' : '',
    isInitial ? 'history-version-initial' : '',
  ].filter(Boolean).join(' ');

  const handleRevert = () => {
    onRevert(version.id);
  };

  // Truncate long prompts
  const displayPrompt = version.prompt.length > 150 
    ? version.prompt.substring(0, 150) + '...' 
    : version.prompt;

  return (
    <div className={versionClass}>
      <div className="history-version-card">
        <div className="history-version-header">
          <div className="history-version-meta">
            <span className="history-version-timestamp">
              {formatTimestamp(version.timestamp)}
            </span>
            {isCurrent && (
              <span className="history-version-label history-version-label-current">
                Current
              </span>
            )}
            {isInitial && (
              <span className="history-version-label history-version-label-initial">
                Initial
              </span>
            )}
          </div>
        </div>

        <div className="history-version-prompt" title={version.prompt}>
          {displayPrompt}
        </div>

        {version.diffs.length > 0 && (
          <div className="history-version-stats">
            <span className="history-version-stat">
              {stats.filesChanged} file{stats.filesChanged !== 1 ? 's' : ''}
            </span>
            {stats.linesAdded > 0 && (
              <span className="history-version-stat history-version-stat-added">
                +{stats.linesAdded}
              </span>
            )}
            {stats.linesDeleted > 0 && (
              <span className="history-version-stat history-version-stat-deleted">
                -{stats.linesDeleted}
              </span>
            )}
          </div>
        )}

        {!isCurrent && (
          <button
            className="history-revert-button"
            onClick={handleRevert}
            disabled={isLoading}
            aria-label={`Revert to version from ${formatTimestamp(version.timestamp)}`}
          >
            {isLoading ? 'Reverting...' : 'Revert to this version'}
          </button>
        )}
      </div>
    </div>
  );
});

export default HistoryPanel;
