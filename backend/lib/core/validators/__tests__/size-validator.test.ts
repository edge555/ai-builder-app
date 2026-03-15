import { describe, expect, it } from 'vitest';
import { validateFileSizes } from '../size-validator';

describe('Size Validator', () => {
    describe('validateFileSizes', () => {
        it('should return empty array for files within size limits', () => {
            const validFiles = {
                'small.js': 'console.log("hello");',
                'medium.ts': 'export const x = 1;',
            };
            const errors = validateFileSizes(validFiles);
            expect(errors).toEqual([]);
        });

        it('should return empty array for empty object', () => {
            const errors = validateFileSizes({});
            expect(errors).toEqual([]);
        });

        it('should return empty array for single small file', () => {
            const validFiles = {
                'index.js': 'console.log("hello");',
            };
            const errors = validateFileSizes(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle empty file content', () => {
            const validFiles = {
                'empty.js': '',
            };
            const errors = validateFileSizes(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle files with unicode characters', () => {
            const validFiles = {
                'unicode.js': 'console.log("你好世界");',
            };
            const errors = validateFileSizes(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle files with special characters', () => {
            const validFiles = {
                'special.js': 'console.log("\\n\\t\\r");',
            };
            const errors = validateFileSizes(validFiles);
            expect(errors).toEqual([]);
        });

        it('should detect file exceeding 100 KB limit', () => {
            const largeContent = 'x'.repeat(1024 * 101); // 101 KB
            const invalidFiles = {
                'large.js': largeContent,
            };
            const errors = validateFileSizes(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'file_too_large',
                message: 'File exceeds 100 KB limit (101.0 KB)',
                filePath: 'large.js',
            });
        });

        it('should detect multiple files exceeding 100 KB limit', () => {
            const largeContent = 'x'.repeat(1024 * 101); // 101 KB
            const invalidFiles = {
                'large1.js': largeContent,
                'large2.js': largeContent,
            };
            const errors = validateFileSizes(invalidFiles);
            expect(errors).toHaveLength(2);
            expect(errors[0].filePath).toBe('large1.js');
            expect(errors[1].filePath).toBe('large2.js');
        });

        it('should detect project exceeding 1 MB limit', () => {
            const mediumContent = 'x'.repeat(1024 * 200); // 200 KB each
            const invalidFiles = {
                'file1.js': mediumContent,
                'file2.js': mediumContent,
                'file3.js': mediumContent,
                'file4.js': mediumContent,
                'file5.js': mediumContent,
                'file6.js': mediumContent,
            };
            const errors = validateFileSizes(invalidFiles);
            expect(errors.length).toBeGreaterThan(1);
            expect(errors.some(e => e.message.includes('Total project size exceeds 1 MB limit'))).toBe(true);
        });

        it('should detect both single file and total size violations', () => {
            const largeContent = 'x'.repeat(1024 * 101); // 101 KB
            const mediumContent = 'x'.repeat(1024 * 200); // 200 KB each
            const invalidFiles = {
                'large.js': largeContent,
                'file1.js': mediumContent,
                'file2.js': mediumContent,
                'file3.js': mediumContent,
                'file4.js': mediumContent,
                'file5.js': mediumContent,
            };
            const errors = validateFileSizes(invalidFiles);
            expect(errors.length).toBeGreaterThan(1);
            expect(errors.some(e => e.filePath === 'large.js')).toBe(true);
            expect(errors.some(e => e.message.includes('Total project size'))).toBe(true);
        });

        it('should handle file exactly at 100 KB limit', () => {
            const exactContent = 'x'.repeat(1024 * 100); // 100 KB
            const validFiles = {
                'exact.js': exactContent,
            };
            const errors = validateFileSizes(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle project exactly at 1 MB limit', () => {
            const exactContent = 'x'.repeat(1024 * 200); // 200 KB each
            const validFiles = {
                'file1.js': exactContent,
                'file2.js': exactContent,
                'file3.js': exactContent,
                'file4.js': exactContent,
                'file5.js': exactContent,
            };
            const errors = validateFileSizes(validFiles);
            expect(errors).toHaveLength(5);
            expect(errors.every(e => e.type === 'file_too_large' && e.filePath)).toBe(true);
        });

        it('should handle file just over 100 KB limit', () => {
            const overContent = 'x'.repeat(1024 * 100 + 1); // 100 KB + 1 byte
            const invalidFiles = {
                'over.js': overContent,
            };
            const errors = validateFileSizes(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].filePath).toBe('over.js');
        });

        it('should handle project just over 1 MB limit', () => {
            const overContent = 'x'.repeat(1024 * 200 + 1); // 200 KB + 1 byte each
            const invalidFiles = {
                'file1.js': overContent,
                'file2.js': overContent,
                'file3.js': overContent,
                'file4.js': overContent,
                'file5.js': overContent,
            };
            const errors = validateFileSizes(invalidFiles);
            expect(errors).toHaveLength(5);
            expect(errors.every(e => e.type === 'file_too_large' && e.filePath)).toBe(true);
        });

        it('should handle mix of valid and invalid files', () => {
            const largeContent = 'x'.repeat(1024 * 101); // 101 KB
            const invalidFiles = {
                'small.js': 'console.log("hello");',
                'large.js': largeContent,
                'medium.ts': 'export const x = 1;',
            };
            const errors = validateFileSizes(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].filePath).toBe('large.js');
        });

        it('should calculate total size correctly across multiple files', () => {
            const files = {
                'file1.js': 'x'.repeat(1024 * 50), // 50 KB
                'file2.js': 'x'.repeat(1024 * 75), // 75 KB
                'file3.js': 'x'.repeat(1024 * 100), // 100 KB
                'file4.js': 'x'.repeat(1024 * 200), // 200 KB
                'file5.js': 'x'.repeat(1024 * 300), // 300 KB
            };
            const errors = validateFileSizes(files);
            expect(errors).toHaveLength(2);
            expect(errors.every(e => e.filePath)).toBe(true);
        });

        it('should handle files with different encodings', () => {
            const validFiles = {
                'ascii.js': 'x'.repeat(1024 * 50), // 50 KB ASCII
                'utf8.js': '你'.repeat(1024 * 25), // 50 KB UTF-8 (3 bytes per char)
            };
            const errors = validateFileSizes(validFiles);
            expect(errors).toEqual([]);
        });

        it('should format size messages with one decimal place', () => {
            const largeContent = 'x'.repeat(1024 * 101 + 512); // 101.5 KB
            const invalidFiles = {
                'large.js': largeContent,
            };
            const errors = validateFileSizes(invalidFiles);
            expect(errors[0].message).toMatch(/\d+\.\d+ KB/);
        });

        it('should handle very small files', () => {
            const validFiles = {
                'tiny.js': 'x',
                'empty.js': '',
            };
            const errors = validateFileSizes(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle files with newlines and tabs', () => {
            const validFiles = {
                'formatted.js': '\n\t'.repeat(1000),
            };
            const errors = validateFileSizes(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle files with escape sequences', () => {
            const validFiles = {
                'escaped.js': '\\n\\t\\r\\b\\f\\v'.repeat(1000),
            };
            const errors = validateFileSizes(validFiles);
            expect(errors).toEqual([]);
        });

        it('should detect size violation for file with mixed content', () => {
            const mixedContent = 'console.log("hello");\n'.repeat(10000); // Large file
            const invalidFiles = {
                'mixed.js': mixedContent,
            };
            const errors = validateFileSizes(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].filePath).toBe('mixed.js');
        });
    });
});
