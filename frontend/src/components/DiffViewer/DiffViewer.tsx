import type { FileDiff, DiffHunk, DiffChange } from '@/shared';
import React, { useState, useMemo } from 'react';
import './DiffViewer.css';

/**
 * Props for the DiffViewer component.
 */
export interface DiffViewerProps {
  /** Array of file diffs to display */
  diffs: FileDiff[];
  /** Callback when user accepts the changes */
  onAccept?: () => void;
  /** Callback when user rejects the changes */
  onReject?: () => void;
  /** Whether to show accept/reject buttons */
  showActions?: boolean;
}

/**
 * Computes summary statistics from diffs.
 */
function computeDiffStats(diffs: FileDiff[]) {
  let filesAdded = 0;
  let filesModified = 0;
  let filesDeleted = 0;
  let linesAdded = 0;
  let linesDeleted = 0;

  for (const diff of diffs) {
    switch (diff.status) {
      case 'added':
        filesAdded++;
        break;
      case 'modified':
        filesModified++;
        break;
      case 'deleted':
        filesDeleted++;
        break;
    }

    // Defensive check: ensure hunks is an array
    if (Array.isArray(diff.hunks)) {
      for (const hunk of diff.hunks) {
        // Defensive check: ensure changes is an array
        if (Array.isArray(hunk.changes)) {
          for (const change of hunk.changes) {
            if (change.type === 'add') linesAdded++;
            if (change.type === 'delete') linesDeleted++;
          }
        }
      }
    }
  }

  return { filesAdded, filesModified, filesDeleted, linesAdded, linesDeleted };
}

/**
 * Diff Viewer component for displaying line-level diffs with syntax highlighting.
 * Shows file status (added/modified/deleted) and provides accept/reject buttons.
 * 
 * Requirements: 5.6
 */
export function DiffViewer({ diffs, onAccept, onReject, showActions = true }: DiffViewerProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const stats = useMemo(() => computeDiffStats(diffs), [diffs]);

  const toggleFile = (filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedFiles(new Set(diffs.map((d) => d.filePath)));
  };

  const collapseAll = () => {
    setExpandedFiles(new Set());
  };

  return (
    <div className="diff-viewer" role="region" aria-label="Diff viewer">
      <div className="diff-viewer-header">
        <span className="diff-viewer-title">
          Changes ({diffs.length} file{diffs.length !== 1 ? 's' : ''})
        </span>
        <div className="diff-viewer-actions">
          {diffs.length > 0 && (
            <>
              <button
                className="diff-action-button"
                onClick={expandedFiles.size === diffs.length ? collapseAll : expandAll}
                data-variant="neutral"
              >
                {expandedFiles.size === diffs.length ? 'Collapse All' : 'Expand All'}
              </button>
            </>
          )}
          {showActions && onReject && (
            <button
              className="diff-action-button diff-action-button-reject"
              onClick={onReject}
              aria-label="Reject changes"
            >
              Reject
            </button>
          )}
          {showActions && onAccept && (
            <button
              className="diff-action-button diff-action-button-accept"
              onClick={onAccept}
              aria-label="Accept changes"
            >
              Accept
            </button>
          )}
        </div>
      </div>

      <div className="diff-file-list">
        {diffs.length === 0 ? (
          <div className="diff-empty-state">No changes to display</div>
        ) : (
          diffs.map((diff) => (
            <DiffFileItem
              key={diff.filePath}
              diff={diff}
              isExpanded={expandedFiles.has(diff.filePath)}
              onToggle={() => toggleFile(diff.filePath)}
            />
          ))
        )}
      </div>

      {diffs.length > 0 && (
        <div className="diff-summary">
          {stats.filesAdded > 0 && (
            <span className="diff-summary-stat diff-summary-added">
              +{stats.filesAdded} added
            </span>
          )}
          {stats.filesModified > 0 && (
            <span className="diff-summary-stat diff-summary-modified">
              ~{stats.filesModified} modified
            </span>
          )}
          {stats.filesDeleted > 0 && (
            <span className="diff-summary-stat diff-summary-deleted">
              -{stats.filesDeleted} deleted
            </span>
          )}
          <span className="diff-summary-stat diff-summary-added">
            +{stats.linesAdded} lines
          </span>
          <span className="diff-summary-stat diff-summary-deleted">
            -{stats.linesDeleted} lines
          </span>
        </div>
      )}
    </div>
  );
}


/**
 * Props for the DiffFileItem component.
 */
interface DiffFileItemProps {
  diff: FileDiff;
  isExpanded: boolean;
  onToggle: () => void;
}

/**
 * Renders a single file diff with expandable content.
 */
const DiffFileItem = React.memo(function DiffFileItem({ diff, isExpanded, onToggle }: DiffFileItemProps) {
  const statusClass = `diff-file-status diff-file-status-${diff.status}`;

  return (
    <div className="diff-file">
      <div
        className="diff-file-header"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={`Toggle diff for ${diff.filePath}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <span className={statusClass}>{diff.status}</span>
        <span className="diff-file-path" title={diff.filePath}>
          {diff.filePath}
        </span>
        <span className="diff-file-toggle">{isExpanded ? '▼' : '▶'}</span>
      </div>
      {isExpanded && (
        <div className="diff-content">
          {Array.isArray(diff.hunks) && diff.hunks.length > 0 ? (
            diff.hunks.map((hunk, index) => (
              <DiffHunkItem key={index} hunk={hunk} />
            ))
          ) : (
            <div className="diff-empty-state">No changes to display</div>
          )}
        </div>
      )}
    </div>
  );
});

/**
 * Props for the DiffHunkItem component.
 */
interface DiffHunkItemProps {
  hunk: DiffHunk;
}

/**
 * Renders a single diff hunk with line changes.
 */
const DiffHunkItem = React.memo(function DiffHunkItem({ hunk }: DiffHunkItemProps) {
  return (
    <div className="diff-hunk">
      <div className="diff-hunk-header">
        @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
      </div>
      {Array.isArray(hunk.changes) && hunk.changes.map((change, index) => (
        <DiffLineItem key={index} change={change} />
      ))}
    </div>
  );
});

/**
 * Props for the DiffLineItem component.
 */
interface DiffLineItemProps {
  change: DiffChange;
}

/**
 * Renders a single diff line with appropriate styling.
 */
const DiffLineItem = React.memo(function DiffLineItem({ change }: DiffLineItemProps) {
  const lineClass = `diff-line diff-line-${change.type}`;

  return (
    <div className={lineClass}>
      <span className="diff-line-number">{change.lineNumber}</span>
      <span className="diff-line-content">{change.content}</span>
    </div>
  );
});

export default DiffViewer;
