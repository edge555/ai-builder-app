/**
 * Change Summarizer Module
 * 
 * Creates human-readable summaries of file changes.
 * Extracted from ModificationEngine for better separation of concerns.
 */

import type { FileDiff, ChangeSummary } from '@ai-app-builder/shared';

/**
 * Create a human-readable change summary.
 */
export function createChangeSummary(diffs: FileDiff[], prompt: string): ChangeSummary {
    let filesAdded = 0;
    let filesModified = 0;
    let filesDeleted = 0;
    let linesAdded = 0;
    let linesDeleted = 0;
    const affectedFiles: string[] = [];

    for (const diff of diffs) {
        affectedFiles.push(diff.filePath);

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

        for (const hunk of diff.hunks) {
            for (const change of hunk.changes) {
                if (change.type === 'add') {
                    linesAdded++;
                } else if (change.type === 'delete') {
                    linesDeleted++;
                }
            }
        }
    }

    // Generate description
    const parts: string[] = [];
    if (filesAdded > 0) {
        parts.push(`${filesAdded} file${filesAdded > 1 ? 's' : ''} added`);
    }
    if (filesModified > 0) {
        parts.push(`${filesModified} file${filesModified > 1 ? 's' : ''} modified`);
    }
    if (filesDeleted > 0) {
        parts.push(`${filesDeleted} file${filesDeleted > 1 ? 's' : ''} deleted`);
    }

    const description = parts.length > 0
        ? `${parts.join(', ')} (${linesAdded} lines added, ${linesDeleted} lines deleted)`
        : 'No changes made';

    return {
        filesAdded,
        filesModified,
        filesDeleted,
        linesAdded,
        linesDeleted,
        description,
        affectedFiles,
    };
}
