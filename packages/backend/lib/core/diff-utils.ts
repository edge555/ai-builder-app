/**
 * Diff Utilities
 * LCS-based diff algorithm for computing file changes.
 */

import type { FileDiff } from '@ai-app-builder/shared';

/**
 * Represents a change in the diff with proper line number tracking.
 * - For 'context': both oldLineNum and newLineNum are valid
 * - For 'add': only newLineNum is valid (oldLineNum is null)
 * - For 'delete': only oldLineNum is valid (newLineNum is null)
 */
interface DiffChange {
    type: 'add' | 'delete' | 'context';
    oldLineNum: number | null;
    newLineNum: number | null;
    content: string;
}

/**
 * Normalize a line for comparison purposes.
 * Removes trailing whitespace and normalizes internal whitespace.
 */
function normalizeLine(line: string): string {
    return line.trimEnd();
}

/**
 * Compute diff hunks using a simple LCS-based algorithm.
 * Now with proper handling of whitespace-only differences.
 */
export function computeLineHunks(
    oldLines: string[],
    newLines: string[]
): FileDiff['hunks'] {
    // Normalize lines for comparison (remove trailing whitespace)
    const normalizedOldLines = oldLines.map(normalizeLine);
    const normalizedNewLines = newLines.map(normalizeLine);
    
    // Build LCS table using normalized lines
    const lcs = buildLCSTable(normalizedOldLines, normalizedNewLines);

    // Backtrack to find the diff with proper line number tracking
    const changes: DiffChange[] = [];

    let i = normalizedOldLines.length;
    let j = normalizedNewLines.length;
    let oldLineNum = oldLines.length;
    let newLineNum = newLines.length;

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && normalizedOldLines[i - 1] === normalizedNewLines[j - 1]) {
            // Context: both line numbers are valid
            // Use the new content (which has the current formatting)
            changes.unshift({
                type: 'context',
                oldLineNum: oldLineNum,
                newLineNum: newLineNum,
                content: normalizedNewLines[j - 1]
            });
            i--;
            j--;
            oldLineNum--;
            newLineNum--;
        } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
            // Add: only newLineNum is valid (this line doesn't exist in old file)
            changes.unshift({
                type: 'add',
                oldLineNum: null,
                newLineNum: newLineNum,
                content: normalizedNewLines[j - 1]
            });
            j--;
            newLineNum--;
        } else if (i > 0) {
            // Delete: only oldLineNum is valid (this line doesn't exist in new file)
            changes.unshift({
                type: 'delete',
                oldLineNum: oldLineNum,
                newLineNum: null,
                content: normalizedOldLines[i - 1]
            });
            i--;
            oldLineNum--;
        }
    }

    // Post-process: collapse adjacent add/delete pairs with identical content into context
    const processedChanges = collapseIdenticalChanges(changes);

    // Group changes into hunks
    return groupChangesIntoHunks(processedChanges);
}

/**
 * Collapse adjacent add/delete pairs that have identical content.
 * This handles cases where the LCS algorithm produces spurious changes
 * due to minor formatting differences that normalize to the same content.
 */
function collapseIdenticalChanges(changes: DiffChange[]): DiffChange[] {
    const result: DiffChange[] = [];
    let i = 0;

    while (i < changes.length) {
        const current = changes[i];
        
        // Look for add/delete or delete/add pairs with identical content
        if (i + 1 < changes.length) {
            const next = changes[i + 1];
            
            // Check for add followed by delete with same content
            if (current.type === 'add' && next.type === 'delete' && 
                current.content.trim() === next.content.trim()) {
                // Convert to context
                result.push({
                    type: 'context',
                    oldLineNum: next.oldLineNum,
                    newLineNum: current.newLineNum,
                    content: current.content
                });
                i += 2;
                continue;
            }
            
            // Check for delete followed by add with same content
            if (current.type === 'delete' && next.type === 'add' && 
                current.content.trim() === next.content.trim()) {
                // Convert to context
                result.push({
                    type: 'context',
                    oldLineNum: current.oldLineNum,
                    newLineNum: next.newLineNum,
                    content: next.content
                });
                i += 2;
                continue;
            }
        }
        
        result.push(current);
        i++;
    }

    return result;
}

/**
 * Build LCS (Longest Common Subsequence) table.
 * Expects pre-normalized lines (trailing whitespace already removed).
 */
export function buildLCSTable(oldLines: string[], newLines: string[]): number[][] {
    const m = oldLines.length;
    const n = newLines.length;
    const lcs: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            // Direct comparison - lines should already be normalized
            if (oldLines[i - 1] === newLines[j - 1]) {
                lcs[i][j] = lcs[i - 1][j - 1] + 1;
            } else {
                lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
            }
        }
    }

    return lcs;
}

/**
 * Group changes into hunks with context lines.
 * Uses a clearer algorithm that properly tracks old/new line positions.
 */
function groupChangesIntoHunks(changes: DiffChange[]): FileDiff['hunks'] {
    if (changes.length === 0) {
        return [];
    }

    const CONTEXT_LINES = 3;
    const hunks: FileDiff['hunks'] = [];

    // Find indices of all non-context changes
    const changeIndices: number[] = [];
    for (let i = 0; i < changes.length; i++) {
        if (changes[i].type !== 'context') {
            changeIndices.push(i);
        }
    }

    // No actual changes, return empty
    if (changeIndices.length === 0) {
        return [];
    }

    // Group changes that are close together into hunk ranges
    const hunkRanges: Array<{ start: number; end: number }> = [];
    let rangeStart = Math.max(0, changeIndices[0] - CONTEXT_LINES);
    let rangeEnd = Math.min(changes.length - 1, changeIndices[0] + CONTEXT_LINES);

    for (let i = 1; i < changeIndices.length; i++) {
        const changeStart = changeIndices[i] - CONTEXT_LINES;
        const changeEnd = changeIndices[i] + CONTEXT_LINES;

        if (changeStart <= rangeEnd + 1) {
            // Merge with current range
            rangeEnd = Math.min(changes.length - 1, changeEnd);
        } else {
            // Save current range and start new one
            hunkRanges.push({ start: rangeStart, end: rangeEnd });
            rangeStart = Math.max(0, changeStart);
            rangeEnd = Math.min(changes.length - 1, changeEnd);
        }
    }
    // Don't forget the last range
    hunkRanges.push({ start: rangeStart, end: rangeEnd });

    // Convert each range into a hunk
    for (const range of hunkRanges) {
        const hunkChanges = changes.slice(range.start, range.end + 1);
        const hunk = createHunkFromChanges(hunkChanges);
        if (hunk) {
            hunks.push(hunk);
        }
    }

    return hunks;
}

/**
 * Create a hunk from a list of changes.
 * Properly calculates oldStart/newStart from valid line numbers only.
 */
function createHunkFromChanges(changes: DiffChange[]): FileDiff['hunks'][0] | null {
    if (changes.length === 0) {
        return null;
    }

    // Find oldStart: first valid oldLineNum (from context or delete)
    let oldStart = 1;
    for (const change of changes) {
        if (change.oldLineNum !== null) {
            oldStart = change.oldLineNum;
            break;
        }
    }

    // Find newStart: first valid newLineNum (from context or add)
    let newStart = 1;
    for (const change of changes) {
        if (change.newLineNum !== null) {
            newStart = change.newLineNum;
            break;
        }
    }

    // Build the changes array for the hunk and count lines
    let oldLines = 0;
    let newLines = 0;
    const hunkChanges: FileDiff['hunks'][0]['changes'] = [];

    for (const change of changes) {
        if (change.type === 'context') {
            oldLines++;
            newLines++;
            hunkChanges.push({
                type: 'context',
                lineNumber: change.newLineNum!, // Always valid for context
                content: change.content,
            });
        } else if (change.type === 'delete') {
            oldLines++;
            hunkChanges.push({
                type: 'delete',
                lineNumber: change.oldLineNum!, // Always valid for delete
                content: change.content,
            });
        } else if (change.type === 'add') {
            newLines++;
            hunkChanges.push({
                type: 'add',
                lineNumber: change.newLineNum!, // Always valid for add
                content: change.content,
            });
        }
    }

    return {
        oldStart,
        oldLines,
        newStart,
        newLines,
        changes: hunkChanges,
    };
}
