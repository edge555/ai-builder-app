/**
 * Diff Computer Module
 * 
 * Handles computing diffs between file states and creating FileDiff objects.
 * Extracted from ModificationEngine for better separation of concerns.
 */

import type { FileDiff } from '@ai-app-builder/shared';
import { computeLineHunks } from '../core/diff-utils';
import { normalizeContent } from './edit-applicator';

/**
 * Compute diffs between old and new file states.
 */
export function computeDiffs(
    oldFiles: Record<string, string>,
    newFiles: Record<string, string>,
    deletedFiles: string[]
): FileDiff[] {
    const diffs: FileDiff[] = [];
    const processedPaths = new Set<string>();

    // Handle modified and added files
    for (const [path, newContent] of Object.entries(newFiles)) {
        processedPaths.add(path);
        const oldContent = oldFiles[path];

        if (oldContent === undefined) {
            // File was added
            diffs.push(createAddedFileDiff(path, newContent));
        } else {
            // Normalize both contents for comparison
            const normalizedOld = normalizeContent(oldContent);
            const normalizedNew = normalizeContent(newContent);

            if (normalizedOld !== normalizedNew) {
                // File was actually modified (not just whitespace changes)
                const fileDiff = createModifiedFileDiff(path, oldContent, newContent);
                // Only include if there are actual hunks with real changes
                if (fileDiff.hunks.length > 0 && hasRealChanges(fileDiff)) {
                    diffs.push(fileDiff);
                }
            }
        }
    }

    // Handle deleted files
    for (const path of deletedFiles) {
        if (oldFiles[path] !== undefined) {
            diffs.push(createDeletedFileDiff(path, oldFiles[path]));
        }
    }

    return diffs;
}

/**
 * Check if a file diff has real changes (not just whitespace).
 */
export function hasRealChanges(fileDiff: FileDiff): boolean {
    for (const hunk of fileDiff.hunks) {
        for (const change of hunk.changes) {
            if (change.type === 'add' || change.type === 'delete') {
                return true;
            }
        }
    }
    return false;
}

/**
 * Create a diff for an added file.
 */
export function createAddedFileDiff(filePath: string, content: string): FileDiff {
    const lines = content.split('\n');
    return {
        filePath,
        status: 'added',
        hunks: [{
            oldStart: 0,
            oldLines: 0,
            newStart: 1,
            newLines: lines.length,
            changes: lines.map((line, index) => ({
                type: 'add' as const,
                lineNumber: index + 1,
                content: line,
            })),
        }],
    };
}

/**
 * Create a diff for a deleted file.
 */
export function createDeletedFileDiff(filePath: string, content: string): FileDiff {
    const lines = content.split('\n');
    return {
        filePath,
        status: 'deleted',
        hunks: [{
            oldStart: 1,
            oldLines: lines.length,
            newStart: 0,
            newLines: 0,
            changes: lines.map((line, index) => ({
                type: 'delete' as const,
                lineNumber: index + 1,
                content: line,
            })),
        }],
    };
}

/**
 * Create a diff for a modified file.
 */
export function createModifiedFileDiff(
    filePath: string,
    oldContent: string,
    newContent: string
): FileDiff {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    return {
        filePath,
        status: 'modified',
        hunks: computeLineHunks(oldLines, newLines),
    };
}
