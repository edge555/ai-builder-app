/**
 * Diff Computer Module
 * 
 * Handles computing diffs between file states and creating FileDiff objects.
 * Extracted from ModificationEngine for better separation of concerns.
 * 
 * This module now delegates core logic to the @ai-app-builder/shared package.
 */

import type { FileDiff, DiffHunk } from '@ai-app-builder/shared';
import {
    computeFileDiff as sharedComputeFileDiff,
    hasRealChanges as sharedHasRealChanges,
    trimTrailingEmptyLines,
    normalizeLine
} from '@ai-app-builder/shared';
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

    // Handle modified and added files
    for (const [path, newContent] of Object.entries(newFiles)) {
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
function hasRealChanges(fileDiff: FileDiff): boolean {
    return sharedHasRealChanges(fileDiff.hunks);
}

/**
 * Create a diff for an added file.
 */
function createAddedFileDiff(filePath: string, content: string): FileDiff {
    const lines = trimTrailingEmptyLines(content.split('\n').map(normalizeLine));
    return {
        filePath,
        status: 'added',
        hunks: lines.length > 0 ? [{
            oldStart: 0,
            oldLines: 0,
            newStart: 1,
            newLines: lines.length,
            changes: lines.map((line, index) => ({
                type: 'add' as const,
                lineNumber: index + 1,
                content: line,
            })),
        }] : [],
    };
}

/**
 * Create a diff for a deleted file.
 */
function createDeletedFileDiff(filePath: string, content: string): FileDiff {
    const lines = trimTrailingEmptyLines(content.split('\n').map(normalizeLine));
    return {
        filePath,
        status: 'deleted',
        hunks: lines.length > 0 ? [{
            oldStart: 1,
            oldLines: lines.length,
            newStart: 0,
            newLines: 0,
            changes: lines.map((line, index) => ({
                type: 'delete' as const,
                lineNumber: index + 1,
                content: line,
            })),
        }] : [],
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
    return {
        filePath,
        status: 'modified',
        hunks: sharedComputeFileDiff(oldContent, newContent),
    };
}
