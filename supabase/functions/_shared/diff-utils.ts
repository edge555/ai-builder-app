/**
 * Diff Utilities for Supabase Edge Functions (Deno)
 * LCS-based diff algorithm for computing file changes.
 * Ported from backend/lib/core/diff-utils.ts
 */

/**
 * Represents the diff for a single file between two versions.
 */
export interface FileDiff {
    /** Path to the file */
    filePath: string;
    /** Status of the file change */
    status: 'added' | 'modified' | 'deleted';
    /** Array of diff hunks containing the actual changes */
    hunks: DiffHunk[];
}

/**
 * Represents a contiguous block of changes in a file.
 */
export interface DiffHunk {
    /** Starting line number in the old file */
    oldStart: number;
    /** Number of lines in the old file */
    oldLines: number;
    /** Starting line number in the new file */
    newStart: number;
    /** Number of lines in the new file */
    newLines: number;
    /** Array of individual line changes */
    changes: DiffChange[];
}

/**
 * Represents a single line change within a diff hunk.
 */
export interface DiffChange {
    /** Type of change: add, delete, or context (unchanged) */
    type: 'add' | 'delete' | 'context';
    /** Line number in the respective file */
    lineNumber: number;
    /** Content of the line */
    content: string;
}

/**
 * Internal type for tracking changes with both old and new line numbers.
 */
interface InternalDiffChange {
    type: 'add' | 'delete' | 'context';
    oldLineNum: number | null;
    newLineNum: number | null;
    content: string;
}

/**
 * Normalize a line for comparison purposes.
 * Removes trailing whitespace.
 */
function normalizeLine(line: string): string {
    return line.trimEnd();
}

/**
 * Build LCS (Longest Common Subsequence) table.
 * Expects pre-normalized lines (trailing whitespace already removed).
 */
function buildLCSTable(oldLines: string[], newLines: string[]): number[][] {
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

/**
 * Collapse adjacent add/delete pairs that have identical content.
 * This handles cases where the LCS algorithm produces spurious changes
 * due to minor formatting differences that normalize to the same content.
 */
function collapseIdenticalChanges(changes: InternalDiffChange[]): InternalDiffChange[] {
    const result: InternalDiffChange[] = [];
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
 * Group changes into hunks with context lines.
 */
function groupChangesIntoHunks(changes: InternalDiffChange[]): DiffHunk[] {
    if (changes.length === 0) {
        return [];
    }

    const CONTEXT_LINES = 3;
    const hunks: DiffHunk[] = [];

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
function createHunkFromChanges(changes: InternalDiffChange[]): DiffHunk | null {
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
    const hunkChanges: DiffChange[] = [];

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

/**
 * Compute diff hunks using a simple LCS-based algorithm.
 * Handles whitespace-only differences properly.
 */
export function computeLineHunks(
    oldLines: string[],
    newLines: string[]
): DiffHunk[] {
    // Normalize lines for comparison (remove trailing whitespace)
    const normalizedOldLines = oldLines.map(normalizeLine);
    const normalizedNewLines = newLines.map(normalizeLine);

    // Build LCS table using normalized lines
    const lcs = buildLCSTable(normalizedOldLines, normalizedNewLines);

    // Backtrack to find the diff with proper line number tracking
    const changes: InternalDiffChange[] = [];

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
 * Compute a FileDiff for a single file given before/after content.
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

    // Split into lines
    const oldLines = beforeContent ? beforeContent.split('\n') : [];
    const newLines = afterContent ? afterContent.split('\n') : [];

    // Compute hunks
    const hunks = computeLineHunks(oldLines, newLines);

    return {
        filePath,
        status,
        hunks,
    };
}
