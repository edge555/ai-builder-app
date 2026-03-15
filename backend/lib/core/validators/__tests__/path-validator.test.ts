import { describe, expect, it } from 'vitest';
import { validateFilePaths } from '../path-validator';

describe('Path Validator', () => {
    describe('validateFilePaths', () => {
        it('should return empty array for valid file paths', () => {
            const validFiles = {
                'index.js': 'console.log("hello");',
                'styles.css': 'body { margin: 0; }',
                'package.json': '{"name": "test"}',
                'README.md': '# Test',
            };
            const errors = validateFilePaths(validFiles);
            expect(errors).toEqual([]);
        });

        it('should detect path traversal with ../', () => {
            const invalidFiles = {
                '../../../etc/passwd': 'content',
                'normal.js': 'content',
            };
            const errors = validateFilePaths(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'invalid_path',
                message: 'Path traversal or absolute path detected: "../../../etc/passwd"',
                filePath: '../../../etc/passwd',
            });
        });

        it('should detect path traversal with ..\\', () => {
            const invalidFiles = {
                '..\\..\\windows\\system32': 'content',
            };
            const errors = validateFilePaths(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'invalid_path',
                message: 'Path traversal or absolute path detected: "..\\..\\windows\\system32"',
                filePath: '..\\..\\windows\\system32',
            });
        });

        it('should detect absolute Unix paths', () => {
            const invalidFiles = {
                '/etc/passwd': 'content',
            };
            const errors = validateFilePaths(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'invalid_path',
                message: 'Path traversal or absolute path detected: "/etc/passwd"',
                filePath: '/etc/passwd',
            });
        });

        it('should detect absolute Windows paths', () => {
            const invalidFiles = {
                'C:\\Windows\\System32': 'content',
            };
            const errors = validateFilePaths(invalidFiles);
            expect(errors).toHaveLength(2);
            expect(errors.some(e => e.message.includes('Path traversal or absolute path detected'))).toBe(true);
        });

        it('should detect invalid characters in paths', () => {
            const invalidFiles = {
                'file<name>.js': 'content',
            };
            const errors = validateFilePaths(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'invalid_path',
                message: 'Invalid characters in path: "file<name>.js"',
                filePath: 'file<name>.js',
            });
        });

        it('should detect multiple invalid characters', () => {
            const invalidFiles = {
                'file|name.js': 'content',
                'file:name.js': 'content',
                'file?name.js': 'content',
                'file*name.js': 'content',
            };
            const errors = validateFilePaths(invalidFiles);
            expect(errors).toHaveLength(4);
        });

        it('should detect empty file paths', () => {
            const invalidFiles = {
                '': 'content',
                'normal.js': 'content',
            };
            const errors = validateFilePaths(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'invalid_path',
                message: 'Empty file path',
                filePath: '',
            });
        });

        it('should detect whitespace-only file paths', () => {
            const invalidFiles = {
                '   ': 'content',
            };
            const errors = validateFilePaths(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'invalid_path',
                message: 'Empty file path',
                filePath: '   ',
            });
        });

        it('should detect invalid file extensions', () => {
            const invalidFiles = {
                'malware.exe': 'content',
            };
            const errors = validateFilePaths(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'invalid_path',
                message: 'Invalid file extension ".exe" in path: "malware.exe"',
                filePath: 'malware.exe',
            });
        });

        it('should allow valid file extensions', () => {
            const validFiles = {
                'file.ts': 'content',
                'file.js': 'content',
                'file.json': 'content',
                'file.css': 'content',
                'file.html': 'content',
                'file.md': 'content',
                'file.svg': 'content',
                'file.png': 'content',
                'file.jpg': 'content',
                'file.jpeg': 'content',
                'file.gif': 'content',
                'file.ico': 'content',
                'file.webp': 'content',
                'file.yaml': 'content',
                'file.yml': 'content',
                'file.env': 'content',
            };
            const errors = validateFilePaths(validFiles);
            expect(errors).toEqual([]);
        });

        it('should allow dotfiles without extension validation', () => {
            const validFiles = {
                '.gitignore': 'node_modules\n',
                '.env': 'API_KEY=secret\n',
                '.eslintrc': '{}',
                '.prettierrc': '{}',
            };
            const errors = validateFilePaths(validFiles);
            expect(errors).toEqual([]);
        });

        it('should allow TypeScript variants', () => {
            const validFiles = {
                'file.mts': 'content',
                'file.mjs': 'content',
                'file.cjs': 'content',
                'file.d.ts': 'content',
            };
            const errors = validateFilePaths(validFiles);
            expect(errors).toEqual([]);
        });

        it('should allow source map files', () => {
            const validFiles = {
                'file.js.map': 'content',
            };
            const errors = validateFilePaths(validFiles);
            expect(errors).toEqual([]);
        });

        it('should allow font files', () => {
            const validFiles = {
                'font.woff': 'content',
                'font.woff2': 'content',
                'font.ttf': 'content',
                'font.otf': 'content',
                'font.eot': 'content',
            };
            const errors = validateFilePaths(validFiles);
            expect(errors).toEqual([]);
        });

        it('should allow config files', () => {
            const validFiles = {
                'config.toml': 'content',
                '.editorconfig': 'content',
                '.browserslistrc': 'content',
            };
            const errors = validateFilePaths(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle nested paths', () => {
            const validFiles = {
                'src/index.js': 'content',
                'src/components/Button.tsx': 'content',
                'public/images/logo.png': 'content',
                'tests/unit/test.spec.ts': 'content',
            };
            const errors = validateFilePaths(validFiles);
            expect(errors).toEqual([]);
        });

        it('should detect path traversal in nested paths', () => {
            const invalidFiles = {
                'src/../../../etc/passwd': 'content',
            };
            const errors = validateFilePaths(invalidFiles);
            expect(errors).toHaveLength(2);
            expect(errors.some(e => e.filePath === 'src/../../../etc/passwd')).toBe(true);
        });

        it('should handle files without extensions', () => {
            const validFiles = {
                'Makefile': 'content',
                'Dockerfile': 'content',
            };
            const errors = validateFilePaths(validFiles);
            expect(errors).toEqual([]);
        });

        it('should be case-insensitive for extension validation', () => {
            const validFiles = {
                'file.JS': 'content',
                'file.TS': 'content',
                'file.JSON': 'content',
                'file.PNG': 'content',
            };
            const errors = validateFilePaths(validFiles);
            expect(errors).toEqual([]);
        });

        it('should allow multiple valid files', () => {
            const validFiles = {
                'src/index.ts': 'export {};',
                'src/App.tsx': 'export default function App() {}',
                'src/styles.css': 'body {}',
                'public/index.html': '<html></html>',
                'package.json': '{}',
                'README.md': '# Project',
                '.gitignore': 'node_modules',
            };
            const errors = validateFilePaths(validFiles);
            expect(errors).toEqual([]);
        });

        it('should return multiple errors for multiple invalid files', () => {
            const invalidFiles = {
                '../../../etc/passwd': 'content',
                'file<name>.js': 'content',
                'malware.exe': 'content',
                'normal.js': 'content',
            };
            const errors = validateFilePaths(invalidFiles);
            expect(errors).toHaveLength(3);
            expect(errors.some(e => e.filePath === '../../../etc/passwd')).toBe(true);
            expect(errors.some(e => e.filePath === 'file<name>.js')).toBe(true);
            expect(errors.some(e => e.filePath === 'malware.exe')).toBe(true);
        });

        it('should handle unicode characters in file paths', () => {
            const validFiles = {
                '文件.js': 'content',
                'fichier.ts': 'content',
            };
            const errors = validateFilePaths(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle special characters in file names (excluding invalid ones)', () => {
            const validFiles = {
                'file-name.js': 'content',
                'file_name.js': 'content',
                'file.name.js': 'content',
                'file@name.js': 'content',
                'file+name.js': 'content',
            };
            const errors = validateFilePaths(validFiles);
            expect(errors).toEqual([]);
        });

        it('should detect control characters in paths', () => {
            const invalidFiles = {
                'file\x00name.js': 'content',
            };
            const errors = validateFilePaths(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].type).toBe('invalid_path');
        });

        it('should allow files with dots in name', () => {
            const validFiles = {
                'file.name.js': 'content',
                'file.name.with.dots.js': 'content',
            };
            const errors = validateFilePaths(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle empty object', () => {
            const errors = validateFilePaths({});
            expect(errors).toEqual([]);
        });
    });
});
