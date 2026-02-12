/**
 * Diff Utilities
 * LCS-based diff algorithm for computing file changes.
 * 
 * This module now delegates core logic to the @ai-app-builder/shared package.
 */

import {
    computeFileDiff as sharedComputeFileDiff,
    type DiffHunk as SharedDiffHunk
} from '@ai-app-builder/shared';

/**
 * Compute diff hunks using the shared LCS-based algorithm.
 * Maintains the original API for backward compatibility.
 * 
 * @param oldLines - Array of lines from the old file
 * @param newLines - Array of lines from the new file
 * @returns Array of diff hunks
 */
export function computeLineHunks(
    oldLines: string[],
    newLines: string[]
): SharedDiffHunk[] {
    // Join lines and use shared computeFileDiff
    // The shared implementation handles normalization and trailing empty lines
    return sharedComputeFileDiff(oldLines.join('\n'), newLines.join('\n'));
}

/**
 * Build LCS (Longest Common Subsequence) table.
 * @deprecated Use shared computeLCS if needed, but prefer computeLineHunks.
 */
export function buildLCSTable(oldLines: string[], newLines: string[]): number[][] {
    const m = oldLines.length;
    const n = newLines.length;
    const lcs: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (oldLines[i - 1] === newLines[j - 1]) {
                lcs[i][j] = lcs[i - 1][j - 1] + 1;
            } else {
                lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
            }
        }
    }

    return lcs;
}
