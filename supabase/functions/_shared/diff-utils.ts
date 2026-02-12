/**
 * Diff Utilities for Supabase Edge Functions (Deno)
 * LCS-based diff algorithm for computing file changes.
 * 
 * This module now delegates core logic to the shared package.
 */

import {
    computeFileDiff as sharedComputeFileDiff,
    type FileDiff as SharedFileDiff,
    type DiffHunk as SharedDiffHunk,
    type DiffChange as SharedDiffChange
} from "../../../shared/src/index.ts";

/**
 * Re-export types for backward compatibility within Supabase functions
 */
export type FileDiff = SharedFileDiff;
export type DiffHunk = SharedDiffHunk;
export type DiffChange = SharedDiffChange;

/**
 * Compute diff hunks using the shared LCS-based algorithm.
 * Maintains the original Supabase API for backward compatibility.
 */
export function computeLineHunks(
    oldLines: string[],
    newLines: string[]
): DiffHunk[] {
    // Join lines and use shared computeFileDiff
    // The shared implementation handles normalization and trailing empty lines
    return sharedComputeFileDiff(oldLines.join('\n'), newLines.join('\n'));
}

/**
 * Compute a FileDiff for a single file given before/after content.
 * Maintains the original Supabase API for backward compatibility.
 * 
 * @param filePath - Path to the file
 * @param beforeContent - Content before changes (undefined for new files)
 * @param afterContent - Content after changes (undefined for deleted files)
 * @returns FileDiff object with hunks
 */
export function computeFileDiff(
    filePath: string,
    beforeContent: string | undefined,
    afterContent: string | undefined
): FileDiff {
    // Determine status
    let status: 'added' | 'modified' | 'deleted';
    if (!beforeContent && afterContent) {
        status = 'added';
    } else if (beforeContent && !afterContent) {
        status = 'deleted';
    } else {
        status = 'modified';
    }

    // Compute hunks using shared logic
    // We use join('\n') for consistency if content is empty string vs undefined
    const hunks = sharedComputeFileDiff(beforeContent || '', afterContent || '');

    return {
        filePath,
        status,
        hunks,
    };
}
