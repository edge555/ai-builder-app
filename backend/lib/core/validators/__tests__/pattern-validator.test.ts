import { describe, expect, it } from 'vitest';
import { detectForbiddenPatterns } from '../pattern-validator';

describe('Pattern Validator', () => {
    describe('detectForbiddenPatterns', () => {
        it('should return empty array for clean code', () => {
            const cleanFiles = {
                'index.js': 'console.log("hello");',
                'styles.css': 'body { margin: 0; }',
            };
            const errors = detectForbiddenPatterns(cleanFiles);
            expect(errors).toEqual([]);
        });

        it('should detect markdown code blocks', () => {
            const invalidFiles = {
                'index.js': '```javascript\nconsole.log("hello");\n```',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors.length).toBeGreaterThanOrEqual(1);
            const codeBlockError = errors.find(e => e.message === 'Forbidden pattern detected: markdown code blocks');
            expect(codeBlockError).toBeDefined();
            expect(codeBlockError).toMatchObject({ type: 'forbidden_pattern', filePath: 'index.js', line: 1 });
        });

        it('should detect markdown code fences', () => {
            const invalidFiles = {
                'index.js': '```\nconsole.log("hello");\n```',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors.length).toBeGreaterThanOrEqual(1);
            expect(errors.some(e => e.message.includes('markdown code fence'))).toBe(true);
        });

        it('should detect TODO comments (single line)', () => {
            const invalidFiles = {
                'index.js': '// TODO: implement this\nconsole.log("hello");',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('TODO comments');
            expect(errors[0].line).toBe(1);
        });

        it('should not flag lowercase todo (only uppercase TODO is a stub)', () => {
            const validFiles = {
                'index.js': '// todo: implement this\nconsole.log("hello");',
            };
            const errors = detectForbiddenPatterns(validFiles);
            expect(errors).toHaveLength(0);
        });

        it('should detect TODO block comments', () => {
            const invalidFiles = {
                'index.js': '/* TODO: implement this */\nconsole.log("hello");',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('TODO block comments');
        });

        it('should detect TODO JSX comments', () => {
            const invalidFiles = {
                'App.tsx': 'const App = () => {\n  {/* TODO: add feature */}\n  return <div>Hello</div>;\n};',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(2);
            expect(errors.some(e => e.message.includes('TODO JSX comments'))).toBe(true);
        });

        it('should detect partial-generation stubs with "rest"', () => {
            const invalidFiles = {
                'index.js': '// ... rest of the code\nconsole.log("hello");',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('partial-generation stub');
        });

        it('should detect partial-generation stubs with "remaining"', () => {
            const invalidFiles = {
                'index.js': '// ... remaining code\nconsole.log("hello");',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('partial-generation stub');
        });

        it('should detect partial-generation stubs with "previous"', () => {
            const invalidFiles = {
                'index.js': '// ... previous code\nconsole.log("hello");',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('partial-generation stub');
        });

        it('should detect partial-generation stubs with "existing"', () => {
            const invalidFiles = {
                'index.js': '// ... existing code\nconsole.log("hello");',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('partial-generation stub');
        });

        it('should detect partial-generation stubs with "unchanged"', () => {
            const invalidFiles = {
                'index.js': '// ... unchanged code\nconsole.log("hello");',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('partial-generation stub');
        });

        it('should detect partial-generation stubs with "omitted"', () => {
            const invalidFiles = {
                'index.js': '// ... omitted code\nconsole.log("hello");',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('partial-generation stub');
        });

        it('should detect partial-generation stubs with "implementation"', () => {
            const invalidFiles = {
                'index.js': '// ... implementation\nconsole.log("hello");',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('partial-generation stub');
        });

        it('should detect partial-generation stubs with "code"', () => {
            const invalidFiles = {
                'index.js': '// ... code\nconsole.log("hello");',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('partial-generation stub');
        });

        it('should detect partial-generation stubs with "content"', () => {
            const invalidFiles = {
                'index.js': '// ... content\nconsole.log("hello");',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('partial-generation stub');
        });

        it('should detect trailing ellipsis stub', () => {
            const invalidFiles = {
                'index.js': 'console.log("hello");\n// ...\n',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('trailing ellipsis stub');
        });

        it('should detect partial-generation block stubs', () => {
            const invalidFiles = {
                'index.js': '/* ... rest of the code */\nconsole.log("hello");',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('partial-generation block stub');
        });

        it('should detect JSX ellipsis stub', () => {
            const invalidFiles = {
                'App.tsx': 'const App = () => {\n  return <div>{/* ... */}</div>;\n};',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('JSX ellipsis stub');
        });

        it('should detect instruction stubs with "add"', () => {
            const invalidFiles = {
                'index.js': '// ... add your code here\nconsole.log("hello");',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('instruction stub');
        });

        it('should detect instruction stubs with "insert"', () => {
            const invalidFiles = {
                'index.js': '// ... insert code\nconsole.log("hello");',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('instruction stub');
        });

        it('should detect instruction stubs with "put"', () => {
            const invalidFiles = {
                'index.js': '// ... put code\nconsole.log("hello");',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('instruction stub');
        });

        it('should detect instruction stubs with "write"', () => {
            const invalidFiles = {
                'index.js': '// ... write code\nconsole.log("hello");',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('instruction stub');
        });

        it('should detect instruction stubs with "place"', () => {
            const invalidFiles = {
                'index.js': '// ... place code\nconsole.log("hello");',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('instruction stub');
        });

        it('should detect instruction stubs with "include"', () => {
            const invalidFiles = {
                'index.js': '// ... include code\nconsole.log("hello");',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('instruction stub');
        });

        it('should detect @ts-nocheck directive', () => {
            const invalidFiles = {
                'index.ts': '// @ts-nocheck\nconsole.log("hello");',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('@ts-nocheck directive');
        });

        it('should detect blanket eslint-disable', () => {
            const invalidFiles = {
                'index.js': '// eslint-disable\nconsole.log("hello");',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('blanket eslint-disable');
        });

        it('should detect multiple forbidden patterns in same file', () => {
            const invalidFiles = {
                'index.js': '// TODO: implement\n// ... rest of code\n```javascript\nconsole.log("hello");\n```',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors.length).toBeGreaterThan(1);
        });

        it('should detect forbidden patterns across multiple files', () => {
            const invalidFiles = {
                'file1.js': '// TODO: implement\nconsole.log("hello");',
                'file2.js': '```javascript\nconsole.log("world");\n```',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors.length).toBeGreaterThanOrEqual(2);
            expect(errors.some(e => e.filePath === 'file1.js')).toBe(true);
            expect(errors.some(e => e.filePath === 'file2.js')).toBe(true);
        });

        it('should calculate correct line numbers for patterns', () => {
            const invalidFiles = {
                'index.js': 'console.log("line 1");\nconsole.log("line 2");\n// TODO: implement\nconsole.log("line 4");',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].line).toBe(3);
        });

        it('should handle empty files', () => {
            const validFiles = {
                'empty.js': '',
            };
            const errors = detectForbiddenPatterns(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle files with only newlines', () => {
            const validFiles = {
                'newlines.js': '\n\n\n',
            };
            const errors = detectForbiddenPatterns(validFiles);
            expect(errors).toEqual([]);
        });

        it('should detect patterns at different positions', () => {
            const invalidFiles = {
                'index.js': 'console.log("hello");\n// TODO: implement\nconsole.log("world");\n```javascript\nconsole.log("test");\n```',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors.length).toBeGreaterThanOrEqual(2);
            expect(errors.some(e => e.line === 2)).toBe(true);
            expect(errors.some(e => e.line === 4)).toBe(true);
        });

        it('should not flag normal comments', () => {
            const validFiles = {
                'index.js': '// This is a normal comment\n/* This is also normal */\nconsole.log("hello");',
            };
            const errors = detectForbiddenPatterns(validFiles);
            expect(errors).toEqual([]);
        });

        it('should not flag normal ellipsis in strings', () => {
            const validFiles = {
                'index.js': 'console.log("Loading...");\nconst text = "Wait...";',
            };
            const errors = detectForbiddenPatterns(validFiles);
            expect(errors).toEqual([]);
        });

        it('should only flag uppercase TODO, not lowercase variants', () => {
            const invalidFiles = {
                'index.js': '// todo: implement\n// TODO: implement\n// Todo: implement\n// ToDO: implement',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            // Only "// TODO: implement" matches (uppercase only)
            expect(errors).toHaveLength(1);
        });

        it('should handle case insensitivity for partial-generation stubs', () => {
            const invalidFiles = {
                'index.js': '// ... REST of code\n// ... rest of code\n// ... Rest of code',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(3);
        });

        it('should handle case insensitivity for instruction stubs', () => {
            const invalidFiles = {
                'index.js': '// ... ADD code\n// ... add code\n// ... Add code',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(3);
        });

        it('should handle case insensitivity for @ts-nocheck', () => {
            const invalidFiles = {
                'index.ts': '// @ts-nocheck\n// @TS-NOCHECK\n// @Ts-NoCheck',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(3);
        });

        it('should handle case insensitivity for eslint-disable', () => {
            const invalidFiles = {
                'index.js': '// eslint-disable\n// ESLINT-DISABLE\n// EsLint-Disable',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
        });

        it('should handle multiple occurrences of same pattern', () => {
            const invalidFiles = {
                'index.js': '// TODO: implement 1\nconsole.log("hello");\n// TODO: implement 2\nconsole.log("world");\n// TODO: implement 3',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(3);
            expect(errors[0].line).toBe(1);
            expect(errors[1].line).toBe(3);
            expect(errors[2].line).toBe(5);
        });

        it('should handle empty object', () => {
            const errors = detectForbiddenPatterns({});
            expect(errors).toEqual([]);
        });

        it('should handle files with unicode characters', () => {
            const invalidFiles = {
                'index.js': '// TODO: 实现\nconsole.log("你好");',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('TODO comments');
        });

        it('should detect patterns in JSX files', () => {
            const invalidFiles = {
                'App.tsx': 'const App = () => {\n  {/* TODO: add feature */}\n  // ... rest of JSX\n  return <div>Hello</div>;\n};',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors.length).toBeGreaterThan(1);
        });

        it('should detect patterns in CSS files', () => {
            const invalidFiles = {
                'styles.css': '/* TODO: add styles */\nbody { margin: 0; }',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('TODO block comments');
        });

        it('should detect patterns in JSON files', () => {
            const invalidFiles = {
                'config.json': '{\n  // TODO: add config\n  "key": "value"\n}',
            };
            const errors = detectForbiddenPatterns(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('TODO comments');
        });
    });
});
