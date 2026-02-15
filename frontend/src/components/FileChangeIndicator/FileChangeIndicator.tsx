import type { ChangeSummary } from '@/shared';
import { FileText, FilePlus, FileEdit, FileX } from 'lucide-react';
import React, { useState } from 'react';
import './FileChangeIndicator.css';

export interface FileChangeIndicatorProps {
    /** Change summary containing file change information */
    changeSummary: ChangeSummary;
    /** Callback when a file is clicked */
    onFileClick?: (filePath: string) => void;
    /** Maximum number of files to show before collapsing */
    maxFilesToShow?: number;
}

interface FileChange {
    path: string;
    type: 'added' | 'modified' | 'deleted';
}

/**
 * FileChangeIndicator component displays file changes after AI responses.
 * Shows color-coded indicators for created, modified, and deleted files.
 */
export const FileChangeIndicator: React.FC<FileChangeIndicatorProps> = ({
    changeSummary,
    onFileClick,
    maxFilesToShow = 3,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Parse affected files and determine their change type
    const fileChanges: FileChange[] = React.useMemo(() => {
        const changes: FileChange[] = [];
        const { affectedFiles, filesAdded, filesModified, filesDeleted } = changeSummary;

        // This is a simplified approach - in a real implementation, you'd need
        // more detailed information about which specific files were added/modified/deleted
        // For now, we'll use a heuristic based on the counts
        let addedCount = 0;
        let modifiedCount = 0;
        let deletedCount = 0;

        affectedFiles.forEach((path) => {
            // Simple heuristic: distribute files based on the summary counts
            if (addedCount < filesAdded) {
                changes.push({ path, type: 'added' });
                addedCount++;
            } else if (modifiedCount < filesModified) {
                changes.push({ path, type: 'modified' });
                modifiedCount++;
            } else if (deletedCount < filesDeleted) {
                changes.push({ path, type: 'deleted' });
                deletedCount++;
            } else {
                // Default to modified if we've exhausted counts
                changes.push({ path, type: 'modified' });
            }
        });

        return changes;
    }, [changeSummary]);

    const visibleFiles = isExpanded ? fileChanges : fileChanges.slice(0, maxFilesToShow);
    const hiddenCount = fileChanges.length - maxFilesToShow;

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

    return (
        <div className="file-change-indicator">
            <div className="file-change-header">
                <FileText size={14} />
                <span>File Changes</span>
            </div>
            <div className="file-change-list">
                {visibleFiles.map((change, index) => (
                    <button
                        key={`${change.path}-${index}`}
                        className={`file-change-item file-change-${change.type}`}
                        onClick={() => onFileClick?.(change.path)}
                        disabled={!onFileClick || change.type === 'deleted'}
                        title={onFileClick && change.type !== 'deleted' ? `Click to open ${change.path}` : undefined}
                    >
                        <span className="file-change-icon">{getIcon(change.type)}</span>
                        <span className="file-change-label">{getTypeLabel(change.type)}:</span>
                        <span className="file-change-path">{change.path}</span>
                    </button>
                ))}
                {hiddenCount > 0 && !isExpanded && (
                    <button
                        className="file-change-expand"
                        onClick={() => setIsExpanded(true)}
                    >
                        + {hiddenCount} more file{hiddenCount !== 1 ? 's' : ''}
                    </button>
                )}
                {isExpanded && hiddenCount > 0 && (
                    <button
                        className="file-change-collapse"
                        onClick={() => setIsExpanded(false)}
                    >
                        Show less
                    </button>
                )}
            </div>
        </div>
    );
};

export default FileChangeIndicator;
