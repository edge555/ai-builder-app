import { describe, it, expect } from 'vitest';
import {
    computeFileDiff,
    backtrackDiff,
    computeLCS,
    normalizeLine,
    collapseIdenticalDiffLines
} from '../utils/diff';

describe('Diff Utility Comprehensive Tests', () => {
    describe('normalizeLine', () => {
        it('should trim trailing whitespace', () => {
            expect(normalizeLine('  abc  ')).toBe('  abc');
            expect(normalizeLine('\tdef\r')).toBe('\tdef');
        });
    });

    describe('computeLCS and backtrackDiff', () => {
        it('should handle completely different strings', () => {
            const oldLines = ['a', 'b', 'c'];
            const newLines = ['d', 'e', 'f'];
            const dp = computeLCS(oldLines, newLines);
            const diff = backtrackDiff(dp, oldLines, newLines);

            // Expected: deletions of a, b, c and additions of d, e, f
            // Final order: -a, -b, -c, +d, +e, +f (or mixed depending on preference)
            // backtrackDiff prefers addition if LCS is same
            expect(diff.filter(d => d.type === 'delete')).toHaveLength(3);
            expect(diff.filter(d => d.type === 'add')).toHaveLength(3);
        });

        it('should handle empty strings', () => {
            const oldLines: string[] = [];
            const newLines: string[] = ['a'];
            const dp = computeLCS(oldLines, newLines);
            const diff = backtrackDiff(dp, oldLines, newLines);

            expect(diff).toHaveLength(1);
            expect(diff[0]).toMatchObject({ type: 'add', content: 'a', newLineNumber: 1 });
        });

        it('should handle complex replacements', () => {
            const oldLines = ['line1', 'line2', 'line3'];
            const newLines = ['line1', 'changed2', 'line3'];
            const dp = computeLCS(oldLines, newLines);
            const diff = backtrackDiff(dp, oldLines, newLines);

            expect(diff).toHaveLength(4); // context1, -2, +2, context3 (order might be mixed)
            expect(diff[0].type).toBe('context');
            expect(diff[1].type).toBe('delete');
            expect(diff[2].type).toBe('add');
            expect(diff[3].type).toBe('context');
        });
    });

    describe('collapseIdenticalDiffLines', () => {
        it('should collapse minor formatting changes into context', () => {
            // Suppose normalizeLine didn't catch something or we have different indentation but same text
            // In backtrackDiff, different lines results in delete + add
            const diffLines: any[] = [
                { type: 'delete', content: '  foo', oldLineNumber: 1 },
                { type: 'add', content: 'foo', newLineNumber: 1 }
            ];

            const collapsed = collapseIdenticalDiffLines(diffLines);
            expect(collapsed).toHaveLength(1);
            expect(collapsed[0].type).toBe('context');
            expect(collapsed[0].content).toBe('foo');
            expect(collapsed[0].oldLineNumber).toBe(1);
            expect(collapsed[0].newLineNumber).toBe(1);
        });
    });

    describe('groupIntoHunks', () => {
        it('should create separate hunks for distant changes', () => {
            const oldContent = '1\n2\n3\n4\n5\n6\n7\n8\n9\n10';
            const newContent = '1\nchanged2\n3\n4\n5\n6\n7\n8\nchanged9\n10';
            const hunks = computeFileDiff(oldContent, newContent);

            // With context 3, changes at line 2 and line 9 should be separate hunks
            // Line 2 context: 1, [2], 3, 4, 5
            // Line 9 context: 6, 7, 8, [9], 10
            // Distance between 2 and 9 is 7. Context lines overlap if distance <= 2*3 = 6. 
            // Wait, indices: change at 1 (val 2) and 8 (val 9).
            // hunk1 end: 1 + 3 = 4. hunk2 start: 8 - 3 = 5. 5 > 4, so separate.
            expect(hunks).toHaveLength(2);
        });

        it('should merge close changes into one hunk', () => {
            const oldContent = '1\n2\n3\n4\n5\n6';
            const newContent = '1\nchanged2\n3\nchanged4\n5\n6';
            const hunks = computeFileDiff(oldContent, newContent);

            // Distance is 2 (val 2 at 1, val 4 at 3). 3-3 = 0, which is <= 1+3=4. Merge.
            expect(hunks).toHaveLength(1);
        });
    });
});
