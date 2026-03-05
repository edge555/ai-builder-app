import { History, X, Clock, FileText, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

import type { SerializedVersion, SerializedProjectState, FileDiff } from '@ai-app-builder/shared/types';

import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog';

import { fetchVersions, revertToVersion } from '@/services/version-api';
import { createLogger } from '@/utils/logger';
import './VersionHistoryDrawer.css';

const logger = createLogger('VersionHistory');

export interface VersionHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onRevert: (projectState: SerializedProjectState) => void;
}

function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  return new Date(timestamp).toLocaleDateString();
}

function diffSummary(diffs: FileDiff[]): { added: number; modified: number; deleted: number } {
  let added = 0, modified = 0, deleted = 0;
  for (const d of diffs) {
    if (d.status === 'added') added++;
    else if (d.status === 'modified') modified++;
    else if (d.status === 'deleted') deleted++;
  }
  return { added, modified, deleted };
}

export function VersionHistoryDrawer({
  isOpen,
  onClose,
  projectId,
  onRevert,
}: VersionHistoryDrawerProps) {
  const [versions, setVersions] = useState<SerializedVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isReverting, setIsReverting] = useState(false);

  const [revertConfirm, setRevertConfirm] = useState<{
    isOpen: boolean;
    versionId: string | null;
    prompt: string | null;
  }>({ isOpen: false, versionId: null, prompt: null });

  // Fetch versions when drawer opens
  useEffect(() => {
    if (!isOpen || !projectId) return;

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    fetchVersions(projectId)
      .then((data) => {
        if (!cancelled) {
          // Reverse to show newest first
          setVersions([...data].reverse());
        }
      })
      .catch((err) => {
        if (!cancelled) {
          logger.error('Failed to load versions', { error: err });
          setLoadError(err instanceof Error ? err.message : 'Failed to load versions');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [isOpen, projectId]);

  const handleToggleExpand = useCallback((versionId: string) => {
    setExpandedId((prev) => (prev === versionId ? null : versionId));
  }, []);

  const handleRevertClick = useCallback((versionId: string, prompt: string) => {
    setRevertConfirm({ isOpen: true, versionId, prompt });
  }, []);

  const handleRevertConfirm = useCallback(async () => {
    const { versionId } = revertConfirm;
    if (!versionId || !projectId) return;

    setRevertConfirm({ isOpen: false, versionId: null, prompt: null });
    setIsReverting(true);

    try {
      const result = await revertToVersion(projectId, versionId);
      onRevert(result.projectState);
    } catch (err) {
      logger.error('Failed to revert', { error: err });
    } finally {
      setIsReverting(false);
    }
  }, [revertConfirm, projectId, onRevert]);

  const handleRevertCancel = useCallback(() => {
    setRevertConfirm({ isOpen: false, versionId: null, prompt: null });
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  return (
    <>
      {isOpen && (
        <div className="version-history-backdrop" onClick={onClose} />
      )}

      <div
        className={`version-history-drawer ${isOpen ? 'version-history-drawer--open' : ''}`}
        role="dialog"
        aria-label="Version history"
      >
        {/* Header */}
        <div className="version-history-header">
          <h2 className="version-history-title">
            <History size={16} className="version-history-title-icon" />
            Version History
          </h2>
          <button className="version-history-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Timeline */}
        <div className="version-history-timeline">
          {isLoading && (
            <div className="version-history-loading">
              <div className="version-history-loading-spinner" />
              <span>Loading versions...</span>
            </div>
          )}

          {loadError && (
            <div className="version-history-error">
              <span>{loadError}</span>
            </div>
          )}

          {!isLoading && !loadError && versions.length === 0 && (
            <div className="version-history-empty">
              <History size={32} />
              <span>No versions yet</span>
              <span>Generate or modify your project to create versions.</span>
            </div>
          )}

          {!isLoading && versions.map((version, index) => {
            const isLatest = index === 0;
            const isExpanded = expandedId === version.id;
            const summary = diffSummary(version.diffs);
            const totalChanges = summary.added + summary.modified + summary.deleted;

            return (
              <div
                key={version.id}
                className={`version-card ${isLatest ? 'version-card--current' : ''}`}
                onClick={() => handleToggleExpand(version.id)}
              >
                <div className="version-card-header">
                  <p className="version-card-prompt">
                    {version.prompt || 'Untitled version'}
                  </p>
                  {isLatest && <span className="version-card-badge">Current</span>}
                </div>

                <div className="version-card-meta">
                  <span className="version-card-meta-item">
                    <Clock size={12} />
                    {formatRelativeTime(version.timestamp)}
                  </span>
                  {totalChanges > 0 && (
                    <span className="version-card-meta-item">
                      <FileText size={12} />
                      {totalChanges} file{totalChanges !== 1 ? 's' : ''} changed
                    </span>
                  )}
                  <span className="version-card-meta-item">
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </span>
                </div>

                {/* Expanded: show file diffs */}
                {isExpanded && version.diffs.length > 0 && (
                  <div className="version-card-diffs">
                    {version.diffs.map((diff) => (
                      <div key={diff.filePath} className="version-card-diff-item">
                        <span className={`version-card-diff-status version-card-diff-status--${diff.status}`}>
                          {diff.status === 'added' ? '+' : diff.status === 'deleted' ? '-' : '~'}
                        </span>
                        <span className="version-card-diff-path">{diff.filePath}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Revert button (not on latest) */}
                {isExpanded && !isLatest && (
                  <div className="version-card-actions">
                    <button
                      className="version-card-revert-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRevertClick(version.id, version.prompt);
                      }}
                      disabled={isReverting}
                    >
                      <RotateCcw size={12} />
                      {isReverting ? 'Reverting...' : 'Revert to this'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Revert confirmation dialog */}
      <ConfirmDialog
        isOpen={revertConfirm.isOpen}
        title="Revert to Version"
        message={`Revert to "${revertConfirm.prompt || 'this version'}"? Your current state will be saved to the undo stack.`}
        confirmLabel="Revert"
        confirmVariant="destructive"
        onConfirm={handleRevertConfirm}
        onCancel={handleRevertCancel}
      />
    </>
  );
}
