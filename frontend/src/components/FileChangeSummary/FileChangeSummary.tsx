import type { ChangeSummary, FileDiff } from '@ai-app-builder/shared/types';
import { FileText, FilePlus, FileEdit, FileX, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useMemo } from 'react';
import './FileChangeSummary.css';

export interface FileChangeSummaryProps {
    /** Change summary containing file change information */
    changeSummary: ChangeSummary;
    /** Optional array of diffs for inline viewing */
    diffs?: FileDiff[];
    /** Callback when a file is clicked to open in editor */
    onFileClick?: (filePath: string) => void;
    /** Whether file list is expanded by default */
    defaultExpanded?: boolean;
}

interface FileChange {
    path: string;
    type: 'added' | 'modified' | 'deleted';
}

/**
 * FileChangeSummary component displays file changes with integrated diff viewing.
 * Shows summary statistics, expandable file list, and inline diffs per file.
 */
export function FileChangeSummary({
    changeSummary,
    diffs = [],
    onFileClick,
    defaultExpanded = true,
}: FileChangeSummaryProps) {
    const [isListExpanded, setIsListExpanded] = useState(defaultExpanded);
    const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

    // Map diffs by file path for quick lookup
    const diffsByFile = useMemo(() => {
        const map = new Map<string, FileDiff>();
        diffs.forEach(diff => map.set(diff.filePath, diff));
        return map;
    }, [diffs]);

    // Parse affected files and determine their change type
    const fileChanges: FileChange[] = useMemo(() => {
        const changes: FileChange[] = [];
        const { affectedFiles, filesAdded, filesModified, filesDeleted } = changeSummary;

        // Match files with their types from diffs if available
        affectedFiles.forEach((path) => {
            const diff = diffsByFile.get(path);
            if (diff) {
                changes.push({ path, type: diff.status });
            } else {
                // Fallback heuristic if no diff available
                const addedCount = changes.filter(c => c.type === 'added').length;
                const modifiedCount = changes.filter(c => c.type === 'modified').length;
                const deletedCount = changes.filter(c => c.type === 'deleted').length;

                if (addedCount < filesAdded) {
                    changes.push({ path, type: 'added' });
                } else if (modifiedCount < filesModified) {
                    changes.push({ path, type: 'modified' });
                } else if (deletedCount < filesDeleted) {
                    changes.push({ path, type: 'deleted' });
                } else {
                    changes.push({ path, type: 'modified' });
                }
            }
        });

        return changes;
    }, [changeSummary, diffsByFile]);

    const handleToggleFileDiff = (filePath: string) => {
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

    const getIcon = (type: FileChange['type']) => {
        switch (type) {
            case 'added':
                return <FilePlus size={14} />;
            case 'modified':
                return <FileEdit size={14} />;
            case 'deleted':
                return <FileX size={14} />;
        }
    };

    const getTypeLabel = (type: FileChange['type']) => {
        switch (type) {
            case 'added':
                return 'Created';
            case 'modified':
                return 'Modified';
            case 'deleted':
                return 'Deleted';
        }
    };

    if (fileChanges.length === 0) {
        return null;
    }

    const totalFiles = fileChanges.length;
    const { linesAdded, linesDeleted } = changeSummary;

    return (
        <div className="file-change-summary">
            {/* Header - always visible, clickable to toggle file list */}
            <button
                className="file-change-summary-header"
                onClick={() => setIsListExpanded(!isListExpanded)}
                aria-expanded={isListExpanded}
                aria-label={`${totalFiles} file${totalFiles !== 1 ? 's' : ''} changed. Click to ${isListExpanded ? 'collapse' : 'expand'}`}
            >
                <FileText size={16} />
                <span className="summary-text">
                    {changeSummary.filesAdded > 0 && (
                        <span className="summary-stat stat-added">
                            +{changeSummary.filesAdded} created
                        </span>
                    )}
                    {changeSummary.filesModified > 0 && (
                        <span className="summary-stat stat-modified">
                            ~{changeSummary.filesModified} modified
                        </span>
                    )}
                    {changeSummary.filesDeleted > 0 && (
                        <span className="summary-stat stat-deleted">
                            -{changeSummary.filesDeleted} deleted
                        </span>
                    )}
                    {linesAdded > 0 && (
                        <span className="summary-stat stat-added">
                            +{linesAdded} lines
                        </span>
                    )}
                    {linesDeleted > 0 && (
                        <span className="summary-stat stat-deleted">
                            -{linesDeleted} lines
                        </span>
                    )}
                </span>
                <ChevronDown
                    size={16}
                    className={`chevron ${isListExpanded ? 'rotated' : ''}`}
                />
            </button>

            {/* File list - expandable */}
            {isListExpanded && (
                <div className="file-change-list">
                    {fileChanges.map((change) => {
                        const hasDiff = diffsByFile.has(change.path);
                        const isExpanded = expandedFiles.has(change.path);

                        return (
                            <div key={change.path} className="file-change-item-wrapper">
                                {/* File row */}
                                <div className={`file-change-item file-change-${change.type}`}>
                                    {/* Expand diff toggle */}
                                    <button
                                        className="file-expand-toggle"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleToggleFileDiff(change.path);
                                        }}
                                        disabled={!hasDiff}
                                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} diff for ${change.path}`}
                                        title={hasDiff ? `${isExpanded ? 'Collapse' : 'Expand'} diff` : 'No diff available'}
                                    >
                                        {hasDiff && (
                                            <ChevronRight
                                                size={14}
                                                className={`chevron ${isExpanded ? 'rotated-down' : ''}`}
                                            />
                                        )}
                                    </button>

                                    {/* File icon */}
                                    <span className="file-change-icon">{getIcon(change.type)}</span>

                                    {/* File type label */}
                                    <span className="file-change-label">{getTypeLabel(change.type)}:</span>

                                    {/* File path - clickable to open in editor */}
                                    <button
                                        className="file-path-button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onFileClick?.(change.path);
                                        }}
                                        disabled={!onFileClick || change.type === 'deleted'}
                                        title={onFileClick && change.type !== 'deleted' ? `Click to open ${change.path}` : change.path}
                                    >
                                        {change.path}
                                    </button>
                                </div>

                                {/* Inline diff - expandable */}
                                {isExpanded && hasDiff && (
                                    <div className="file-diff-inline">
                                        <DiffContent diff={diffsByFile.get(change.path)!} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/**
 * Props for the DiffContent component.
 */
interface DiffContentProps {
    diff: FileDiff;
}

/**
 * Renders inline diff content for a single file.
 * Reuses DiffViewer rendering logic.
 */
function DiffContent({ diff }: DiffContentProps) {
    return (
        <div className="diff-content">
            {Array.isArray(diff.hunks) && diff.hunks.length > 0 ? (
                diff.hunks.map((hunk) => (
                    <div key={`hunk-${hunk.oldStart}-${hunk.newStart}`} className="diff-hunk">
                        <div className="diff-hunk-header">
                            @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                        </div>
                        {Array.isArray(hunk.changes) && hunk.changes.map((change, changeIndex) => (
                            <div
                                key={`change-${hunk.oldStart}-${changeIndex}`}
                                className={`diff-line diff-line-${change.type}`}
                            >
                                <span className="diff-line-number">{change.lineNumber || ''}</span>
                                <span className="diff-line-content">{change.content}</span>
                            </div>
                        ))}
                    </div>
                ))
            ) : (
                <div className="diff-empty-state">No changes to display</div>
            )}
        </div>
    );
}

export default FileChangeSummary;
