import { describe, it, expect, vi } from 'vitest';
import { applyEdits, normalizeContent } from '../../diff/edit-applicator';
import * as matcher from '../../diff/multi-tier-matcher';

vi.mock('../../diff/multi-tier-matcher', () => ({
    applySearchReplace: vi.fn(),
}));

describe('EditApplicator', () => {
    describe('applyEdits', () => {
        it('should apply multiple edits successfully', () => {
            const originalContent = 'line 1\nline 2\nline 3';
            const edits = [
                { search: 'line 1', replace: 'new line 1' },
                { search: 'line 2', replace: 'new line 2' },
            ];

            vi.mocked(matcher.applySearchReplace)
                .mockReturnValueOnce({ success: true, content: 'new line 1\nline 2\nline 3' })
                .mockReturnValueOnce({ success: true, content: 'new line 1\nnew line 2\nline 3' });

            const result = applyEdits(originalContent, edits);

            expect(result.success).toBe(true);
            expect(result.content).toBe('new line 1\nnew line 2\nline 3');
            expect(matcher.applySearchReplace).toHaveBeenCalledTimes(2);
        });

        it('should handle escaped sequences in search and replace strings', () => {
            const originalContent = 'line1\nline2';
            const edits = [
                { search: 'line1\\nline2', replace: 'fixed\\ncontent' },
            ];

            vi.mocked(matcher.applySearchReplace).mockReturnValue({
                success: true,
                content: 'fixed\ncontent',
            });

            const result = applyEdits(originalContent, edits);

            expect(result.success).toBe(true);
            expect(matcher.applySearchReplace).toHaveBeenCalledWith(
                originalContent,
                'line1\nline2',
                'fixed\ncontent',
                1
            );
        });

        it('should return error if an edit fails to apply', () => {
            const originalContent = 'line 1\nline 2';
            const edits = [
                { search: 'line 1', replace: 'new line 1' },
                { search: 'missing line', replace: 'won\'t happen' },
            ];

            vi.mocked(matcher.applySearchReplace)
                .mockReturnValueOnce({ success: true, content: 'new line 1\nline 2' })
                .mockReturnValueOnce({ success: false, error: 'Search text not found' });

            const result = applyEdits(originalContent, edits);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Search text not found');
            expect(result.failedEditIndex).toBe(1);
        });

        it('should collect warnings from fuzzy matches', () => {
            const originalContent = 'line 1\nline 2';
            const edits = [
                { search: 'line 1', replace: 'new line 1' },
            ];

            vi.mocked(matcher.applySearchReplace).mockReturnValue({
                success: true,
                content: 'new line 1\nline 2',
                warning: 'Fuzzy match found',
            });

            const result = applyEdits(originalContent, edits);

            expect(result.success).toBe(true);
            expect(result.warnings).toEqual(['Edit 1: Fuzzy match found']);
        });

        it('should use specified occurrence if provided', () => {
            const originalContent = 'foo\nfoo';
            const edits = [
                { search: 'foo', replace: 'bar', occurrence: 2 },
            ];

            vi.mocked(matcher.applySearchReplace).mockReturnValue({
                success: true,
                content: 'foo\nbar',
            });

            applyEdits(originalContent, edits);

            expect(matcher.applySearchReplace).toHaveBeenCalledWith(
                originalContent,
                'foo',
                'bar',
                2
            );
        });
    });

    describe('normalizeContent', () => {
        it('should remove trailing whitespace and ensure consistent line endings', () => {
            const content = 'line 1  \nline 2\t\n  line 3 \n\n';
            const expected = 'line 1\nline 2\n  line 3';

            expect(normalizeContent(content)).toBe(expected);
        });

        it('should handle empty string', () => {
            expect(normalizeContent('')).toBe('');
        });
    });
});
