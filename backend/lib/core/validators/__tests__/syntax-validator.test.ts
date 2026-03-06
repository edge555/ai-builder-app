import { describe, expect, it } from 'vitest';
import { validateSyntax } from '../syntax-validator';

describe('Syntax Validator', () => {
    describe('validateSyntax', () => {
        it('should return empty array for valid TypeScript code', () => {
            const validFiles = {
                'index.ts': 'const x: number = 1;',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should return empty array for valid JavaScript code', () => {
            const validFiles = {
                'index.js': 'const x = 1;',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should return empty array for valid TSX code', () => {
            const validFiles = {
                'App.tsx': 'export default function App() { return <div>Hello</div>; }',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should return empty array for valid JSX code', () => {
            const validFiles = {
                'App.jsx': 'export default function App() { return <div>Hello</div>; }',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should skip non-code files', () => {
            const validFiles = {
                'styles.css': 'body { margin: 0; }',
                'README.md': '# Test',
                'package.json': '{}',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should detect unclosed bracket', () => {
            const invalidFiles = {
                'index.js': 'function test() { console.log("hello");',
            };
            const errors = validateSyntax(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'syntax_error',
                message: "Unclosed bracket '{'",
                filePath: 'index.js',
                line: 1,
            });
        });

        it('should detect unclosed parenthesis', () => {
            const invalidFiles = {
                'index.js': 'function test( { console.log("hello"); }',
            };
            const errors = validateSyntax(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'syntax_error',
                message: "Unclosed bracket '('",
                filePath: 'index.js',
                line: 1,
            });
        });

        it('should detect unclosed square bracket', () => {
            const invalidFiles = {
                'index.js': 'const arr = [1, 2, 3;',
            };
            const errors = validateSyntax(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'syntax_error',
                message: "Unclosed bracket '['",
                filePath: 'index.js',
                line: 1,
            });
        });

        it('should detect unexpected closing bracket', () => {
            const invalidFiles = {
                'index.js': 'function test() } { console.log("hello"); }',
            };
            const errors = validateSyntax(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'syntax_error',
                message: "Unexpected closing bracket '}'",
                filePath: 'index.js',
                line: 1,
            });
        });

        it('should detect mismatched brackets', () => {
            const invalidFiles = {
                'index.js': 'function test() { console.log("hello"); ]',
            };
            const errors = validateSyntax(invalidFiles);
            expect(errors).toHaveLength(2);
            expect(errors[0]).toEqual({
                type: 'syntax_error',
                message: "Mismatched brackets: expected '}' but found ']'",
                filePath: 'index.js',
                line: 1,
            });
            expect(errors[1]).toEqual({
                type: 'syntax_error',
                message: "Unclosed bracket '{'",
                filePath: 'index.js',
                line: 1,
            });
        });

        it('should detect unclosed string literal', () => {
            const invalidFiles = {
                'index.js': 'const str = "hello;',
            };
            const errors = validateSyntax(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'syntax_error',
                message: 'Unclosed string literal',
                filePath: 'index.js',
                line: 1,
            });
        });

        it('should detect unclosed single quote string', () => {
            const invalidFiles = {
                'index.js': "const str = 'hello;",
            };
            const errors = validateSyntax(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'syntax_error',
                message: 'Unclosed string literal',
                filePath: 'index.js',
                line: 1,
            });
        });

        it('should detect unclosed template literal', () => {
            const invalidFiles = {
                'index.js': 'const str = `hello;',
            };
            const errors = validateSyntax(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'syntax_error',
                message: 'Unclosed template literal',
                filePath: 'index.js',
                line: 1,
            });
        });

        it('should handle escaped quotes in strings', () => {
            const validFiles = {
                'index.js': 'const str = "hello \\"world\\"";',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle escaped backticks in template literals', () => {
            const validFiles = {
                'index.js': 'const str = `hello \\`world\\``;',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle nested brackets correctly', () => {
            const validFiles = {
                'index.js': 'function test() { if (true) { const arr = [1, 2]; } }',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle comments correctly', () => {
            const validFiles = {
                'index.js': '// This is a comment\n/* This is a block comment */\nconst x = 1;',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should ignore brackets in comments', () => {
            const validFiles = {
                'index.js': '// This has { brackets }\n/* This has [ brackets ] */\nconst x = 1;',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should ignore brackets in strings', () => {
            const validFiles = {
                'index.js': 'const str = "This has { brackets }";',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should ignore brackets in template literals', () => {
            const validFiles = {
                'index.js': 'const str = `This has { brackets }`;',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle line comments correctly', () => {
            const validFiles = {
                'index.js': '// Line 1\n// Line 2\nconst x = 1;',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle block comments correctly', () => {
            const validFiles = {
                'index.js': '/* Block comment\n spanning multiple lines */\nconst x = 1;',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle mixed quotes', () => {
            const validFiles = {
                'index.js': 'const str1 = "double";\nconst str2 = \'single\';\nconst str3 = `template`;',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle empty files', () => {
            const validFiles = {
                'index.js': '',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle files with only whitespace', () => {
            const validFiles = {
                'index.js': '   \n\t\n   ',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle files with only comments', () => {
            const validFiles = {
                'index.js': '// Comment\n/* Block comment */',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should detect errors on correct line numbers', () => {
            const invalidFiles = {
                'index.js': 'const x = 1;\nconst y = 2;\nfunction test() {\n  console.log("hello");',
            };
            const errors = validateSyntax(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].line).toBe(3);
        });

        it('should handle multiple files', () => {
            const mixedFiles = {
                'valid.js': 'const x = 1;',
                'invalid.js': 'function test() { console.log("hello");',
            };
            const errors = validateSyntax(mixedFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].filePath).toBe('invalid.js');
        });

        it('should detect multiple errors in single file', () => {
            const invalidFiles = {
                'index.js': 'function test( { console.log("hello"; ]',
            };
            const errors = validateSyntax(invalidFiles);
            expect(errors.length).toBeGreaterThan(1);
        });

        it('should handle JSX syntax', () => {
            const validFiles = {
                'App.tsx': 'export default function App() { return <div className="test">Hello</div>; }',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle template literals with expressions', () => {
            const validFiles = {
                'index.js': 'const str = `Hello ${name}`;',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle arrow functions', () => {
            const validFiles = {
                'index.js': 'const fn = () => { return 1; };',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle async/await syntax', () => {
            const validFiles = {
                'index.js': 'async function test() { await Promise.resolve(); }',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle destructuring', () => {
            const validFiles = {
                'index.js': 'const { a, b } = obj;\nconst [c, d] = arr;',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle spread operator', () => {
            const validFiles = {
                'index.js': 'const obj = { ...a, ...b };\nconst arr = [...c, ...d];',
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle empty object', () => {
            const errors = validateSyntax({});
            expect(errors).toEqual([]);
        });

        it('should handle files with different extensions', () => {
            const mixedFiles = {
                'file.ts': 'const x: number = 1;',
                'file.tsx': 'export default function App() { return <div>Hello</div>; }',
                'file.js': 'const y = 2;',
                'file.jsx': 'export default function App() { return <div>Hello</div>; }',
                'file.css': 'body { margin: 0; }',
                'file.json': '{}',
            };
            const errors = validateSyntax(mixedFiles);
            expect(errors).toEqual([]);
        });

        it('should handle complex nested structures', () => {
            const validFiles = {
                'index.js': `
                    function outer() {
                        if (true) {
                            const arr = [
                                { a: 1, b: 2 },
                                { a: 3, b: 4 }
                            ];
                            arr.forEach(item => {
                                console.log(item);
                            });
                        }
                    }
                `,
            };
            const errors = validateSyntax(validFiles);
            expect(errors).toEqual([]);
        });

        it('should detect errors in complex structures', () => {
            const invalidFiles = {
                'index.js': `
                    function outer() {
                        if (true) {
                            const arr = [
                                { a: 1, b: 2 },
                                { a: 3, b: 4 }
                            ];
                            arr.forEach(item => {
                                console.log(item);
                        }
                    }
                `,
            };
            const errors = validateSyntax(invalidFiles);
            expect(errors.length).toBeGreaterThan(0);
        });
    });
});
