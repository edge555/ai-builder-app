import type { FileDiff, DiffHunk, DiffChange, ChangeSummary, ProjectState } from '../types';

/**
 * Constants for diff computation
 */
export const DIFF_CONTEXT_LINES = 3;

/**
 * Represents a line in a diff computation.
 */
interface DiffLine {
    type: 'add' | 'delete' | 'context';
    content: string;
    oldLineNumber?: number;
    newLineNumber?: number;
}

/**
 * Normalize a line for comparison purposes.
 * Removes trailing whitespace.
 */
export function normalizeLine(line: string): string {
    return line.trimEnd();
}

/**
 * Computes the Longest Common Subsequence (LCS) of two arrays.
 * Used for computing line-level diffs.
 * Expects pre-normalized lines for accurate comparison.
 */
export function computeLCS(oldLines: string[], newLines: string[]): number[][] {
    const m = oldLines.length;
    const n = newLines.length;

    // Create DP table
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    // Fill the DP table - direct comparison (lines should be normalized)
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (oldLines[i - 1] === newLines[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    return dp;
}

/**
 * Backtracks through the LCS table to produce diff lines.
 * Expects pre-normalized lines for accurate comparison.
 */
export function backtrackDiff(
    dp: number[][],
    oldLines: string[],
    newLines: string[]
): DiffLine[] {
    let i = oldLines.length;
    let j = newLines.length;
    let oldLineNum = oldLines.length;
    let newLineNum = newLines.length;

    // Temporary storage for reverse order
    const temp: DiffLine[] = [];

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
            // Lines are equal - context (use new content for current formatting)
            temp.push({
                type: 'context',
                content: newLines[j - 1],
                oldLineNumber: oldLineNum,
                newLineNumber: newLineNum,
            });
            i--;
            j--;
            oldLineNum--;
            newLineNum--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            // Line was added
            temp.push({
                type: 'add',
                content: newLines[j - 1],
                newLineNumber: newLineNum,
            });
            j--;
            newLineNum--;
        } else if (i > 0) {
            // Line was deleted
            temp.push({
                type: 'delete',
                content: oldLines[i - 1],
                oldLineNumber: oldLineNum,
            });
            i--;
            oldLineNum--;
        }
    }

    // Post-process: collapse adjacent add/delete pairs with identical content
    const collapsed = collapseIdenticalDiffLines(temp);

    // Reverse to get correct order
    return collapsed.reverse();
}

/**
 * Collapse adjacent add/delete pairs that have identical trimmed content.
 * This handles cases where minor formatting differences cause spurious changes.
 */
export function collapseIdenticalDiffLines(lines: DiffLine[]): DiffLine[] {
    const result: DiffLine[] = [];
    let i = 0;

    while (i < lines.length) {
        const current = lines[i];

        // Look for add/delete or delete/add pairs with identical content
        if (i + 1 < lines.length) {
            const next = lines[i + 1];

            // Check for add followed by delete with same trimmed content
            if (current.type === 'add' && next.type === 'delete' &&
                current.content.trim() === next.content.trim()) {
                // Convert to context
                result.push({
                    type: 'context',
                    content: current.content,
                    oldLineNumber: next.oldLineNumber,
                    newLineNumber: current.newLineNumber,
                });
                i += 2;
                continue;
            }

            // Check for delete followed by add with same trimmed content
            if (current.type === 'delete' && next.type === 'add' &&
                current.content.trim() === next.content.trim()) {
                // Convert to context
                result.push({
                    type: 'context',
                    content: next.content,
                    oldLineNumber: current.oldLineNumber,
                    newLineNumber: next.newLineNumber,
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
 * Groups diff lines into hunks with context.
 */
export function groupIntoHunks(
    diffLines: DiffLine[],
    contextLines: number = DIFF_CONTEXT_LINES
): DiffHunk[] {
    const hunks: DiffHunk[] = [];

    // Find ranges of changes
    const changeIndices: number[] = [];
    diffLines.forEach((line, index) => {
        if (line.type !== 'context') {
            changeIndices.push(index);
        }
    });

    if (changeIndices.length === 0) {
        return [];
    }

    // Group changes that are close together
    let hunkStart = Math.max(0, changeIndices[0] - contextLines);
    let hunkEnd = Math.min(diffLines.length - 1, changeIndices[0] + contextLines);

    const hunkRanges: Array<{ start: number; end: number }> = [];

    for (let i = 1; i < changeIndices.length; i++) {
        const changeStart = changeIndices[i] - contextLines;
        const changeEnd = changeIndices[i] + contextLines;

        if (changeStart <= hunkEnd) {
            // Merge with current hunk
            hunkEnd = Math.min(diffLines.length - 1, changeEnd);
        } else {
            // Save current hunk and start new one
            hunkRanges.push({ start: hunkStart, end: hunkEnd });
            hunkStart = Math.max(0, changeStart);
            hunkEnd = Math.min(diffLines.length - 1, changeEnd);
        }
    }

    // Don't forget the last hunk
    hunkRanges.push({ start: hunkStart, end: hunkEnd });

    // Convert ranges to hunks
    for (const range of hunkRanges) {
        const hunkLines = diffLines.slice(range.start, range.end + 1);

        // Calculate hunk metadata
        let oldStart = 0;
        let oldLines = 0;
        let newStart = 0;
        let newLines = 0;

        const changes: DiffChange[] = [];

        for (const line of hunkLines) {
            if (line.type === 'context') {
                if (oldStart === 0 && line.oldLineNumber) oldStart = line.oldLineNumber;
                if (newStart === 0 && line.newLineNumber) newStart = line.newLineNumber;
                oldLines++;
                newLines++;
                changes.push({
                    type: 'context',
                    lineNumber: line.newLineNumber || line.oldLineNumber || 0,
                    content: line.content,
                });
            } else if (line.type === 'delete') {
                if (oldStart === 0 && line.oldLineNumber) oldStart = line.oldLineNumber;
                oldLines++;
                changes.push({
                    type: 'delete',
                    lineNumber: line.oldLineNumber || 0,
                    content: line.content,
                });
            } else if (line.type === 'add') {
                if (newStart === 0 && line.newLineNumber) newStart = line.newLineNumber;
                newLines++;
                changes.push({
                    type: 'add',
                    lineNumber: line.newLineNumber || 0,
                    content: line.content,
                });
            }
        }

        // Ensure we have valid start positions
        if (oldStart === 0) oldStart = 1;
        if (newStart === 0) newStart = 1;

        hunks.push({
            oldStart,
            oldLines,
            newStart,
            newLines,
            changes,
        });
    }

    return hunks;
}

/**
 * Computes the diff between two file contents.
 * Normalizes lines (removes trailing whitespace) before comparison.
 */
export function computeFileDiff(oldContent: string, newContent: string): DiffHunk[] {
    // Normalize lines by removing trailing whitespace and filter trailing empty lines
    const oldLines = trimTrailingEmptyLines(oldContent.split('\n').map(normalizeLine));
    const newLines = trimTrailingEmptyLines(newContent.split('\n').map(normalizeLine));

    // Compute LCS with normalized lines
    const dp = computeLCS(oldLines, newLines);

    // Backtrack to get diff lines
    const diffLines = backtrackDiff(dp, oldLines, newLines);

    // Group into hunks
    return groupIntoHunks(diffLines);
}

/**
 * Remove trailing empty lines from an array of lines.
 * Preserves empty lines within content, only trims from the end.
 */
export function trimTrailingEmptyLines(lines: string[]): string[] {
    let endIndex = lines.length;
    while (endIndex > 0 && lines[endIndex - 1] === '') {
        endIndex--;
    }
    return lines.slice(0, endIndex);
}

/**
 * Normalize content for comparison (removes trailing whitespace from lines).
 */
export function normalizeContent(content: string): string {
    return content
        .split('\n')
        .map(line => line.trimEnd())
        .join('\n')
        .trimEnd();
}

/**
 * Check if a file diff has real changes (not just context lines).
 */
export function hasRealChanges(hunks: DiffHunk[]): boolean {
    for (const hunk of hunks) {
        for (const change of hunk.changes) {
            if (change.type === 'add' || change.type === 'delete') {
                return true;
            }
        }
    }
    return false;
}

/**
 * Computes diffs between two project states.
 */
export function computeDiffs(
    oldState: ProjectState | null,
    newState: ProjectState
): FileDiff[] {
    const diffs: FileDiff[] = [];
    const oldFiles = oldState?.files ?? {};
    const newFiles = newState.files;

    // Get all unique file paths
    const allPaths = new Set([
        ...Object.keys(oldFiles),
        ...Object.keys(newFiles),
    ]);

    for (const filePath of allPaths) {
        const oldContent = oldFiles[filePath];
        const newContent = newFiles[filePath];

        if (oldContent === undefined && newContent !== undefined) {
            // File was added
            const lines = trimTrailingEmptyLines(newContent.split('\n').map(normalizeLine));
            const changes: DiffChange[] = lines.map((lineContent: string, index: number) => ({
                type: 'add' as const,
                lineNumber: index + 1,
                content: lineContent,
            }));

            diffs.push({
                filePath,
                status: 'added',
                hunks: changes.length > 0 ? [{
                    oldStart: 0,
                    oldLines: 0,
                    newStart: 1,
                    newLines: lines.length,
                    changes,
                }] : [],
            });
        } else if (oldContent !== undefined && newContent === undefined) {
            // File was deleted
            const lines = trimTrailingEmptyLines(oldContent.split('\n').map(normalizeLine));
            const changes: DiffChange[] = lines.map((lineContent: string, index: number) => ({
                type: 'delete' as const,
                lineNumber: index + 1,
                content: lineContent,
            }));

            diffs.push({
                filePath,
                status: 'deleted',
                hunks: changes.length > 0 ? [{
                    oldStart: 1,
                    oldLines: lines.length,
                    newStart: 0,
                    newLines: 0,
                    changes,
                }] : [],
            });
        } else if (oldContent !== undefined && newContent !== undefined) {
            // Check if content is actually different after normalization
            const normalizedOld = normalizeContent(oldContent);
            const normalizedNew = normalizeContent(newContent);

            if (normalizedOld !== normalizedNew) {
                // File was modified with real changes
                const hunks = computeFileDiff(oldContent, newContent);

                // Only include if there are hunks with actual changes
                if (hunks.length > 0 && hasRealChanges(hunks)) {
                    diffs.push({
                        filePath,
                        status: 'modified',
                        hunks,
                    });
                }
            }
        }
    }

    // Sort diffs by file path for consistent ordering
    return diffs.sort((a, b) => a.filePath.localeCompare(b.filePath));
}

/**
 * Computes diffs between two file maps (for version comparison).
 */
export function computeDiffsFromFiles(
    oldFiles: Record<string, string>,
    newFiles: Record<string, string>
): FileDiff[] {
    const diffs: FileDiff[] = [];

    // Get all unique file paths
    const allPaths = new Set([
        ...Object.keys(oldFiles),
        ...Object.keys(newFiles),
    ]);

    for (const filePath of allPaths) {
        const oldContent = oldFiles[filePath];
        const newContent = newFiles[filePath];

        if (oldContent === undefined && newContent !== undefined) {
            // File was added
            const lines = trimTrailingEmptyLines(newContent.split('\n').map(normalizeLine));
            const changes: DiffChange[] = lines.map((content, index) => ({
                type: 'add' as const,
                lineNumber: index + 1,
                content,
            }));

            diffs.push({
                filePath,
                status: 'added',
                hunks: changes.length > 0 ? [{
                    oldStart: 0,
                    oldLines: 0,
                    newStart: 1,
                    newLines: lines.length,
                    changes,
                }] : [],
            });
        } else if (oldContent !== undefined && newContent === undefined) {
            // File was deleted
            const lines = trimTrailingEmptyLines(oldContent.split('\n').map(normalizeLine));
            const changes: DiffChange[] = lines.map((content, index) => ({
                type: 'delete' as const,
                lineNumber: index + 1,
                content,
            }));

            diffs.push({
                filePath,
                status: 'deleted',
                hunks: changes.length > 0 ? [{
                    oldStart: 1,
                    oldLines: lines.length,
                    newStart: 0,
                    newLines: 0,
                    changes,
                }] : [],
            });
        } else if (oldContent !== undefined && newContent !== undefined) {
            // Check if content is actually different after normalization
            const normalizedOld = normalizeContent(oldContent);
            const normalizedNew = normalizeContent(newContent);

            if (normalizedOld !== normalizedNew) {
                // File was modified with real changes
                const hunks = computeFileDiff(oldContent, newContent);

                // Only include if there are hunks with actual changes
                if (hunks.length > 0 && hasRealChanges(hunks)) {
                    diffs.push({
                        filePath,
                        status: 'modified',
                        hunks,
                    });
                }
            }
        }
    }

    // Sort diffs by file path for consistent ordering
    return diffs.sort((a, b) => a.filePath.localeCompare(b.filePath));
}

/**
 * Generates a human-readable change summary from diffs.
 */
export function generateChangeSummary(diffs: FileDiff[]): ChangeSummary {
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

        // Count line changes
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

    // Generate human-readable description
    const parts: string[] = [];

    if (filesAdded > 0) {
        parts.push(`${filesAdded} file${filesAdded === 1 ? '' : 's'} added`);
    }
    if (filesModified > 0) {
        parts.push(`${filesModified} file${filesModified === 1 ? '' : 's'} modified`);
    }
    if (filesDeleted > 0) {
        parts.push(`${filesDeleted} file${filesDeleted === 1 ? '' : 's'} deleted`);
    }

    let description = parts.length > 0 ? parts.join(', ') : 'No changes';

    if (linesAdded > 0 || linesDeleted > 0) {
        const lineChanges: string[] = [];
        if (linesAdded > 0) {
            lineChanges.push(`+${linesAdded}`);
        }
        if (linesDeleted > 0) {
            lineChanges.push(`-${linesDeleted}`);
        }
        description += ` (${lineChanges.join(', ')} lines)`;
    }

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
