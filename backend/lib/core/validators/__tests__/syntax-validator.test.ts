import { describe, expect, it } from 'vitest';
import { validateSyntax } from '../syntax-validator';

describe('Syntax Validator (AST)', () => {
    it('returns no errors for valid TS/JS/TSX/JSX', () => {
        const files = {
            'a.ts': 'const x: number = 1;',
            'b.js': 'const y = 2;',
            'c.tsx': 'export default function App() { return <div>Hello</div>; }',
            'd.jsx': 'export default function App() { return <span>Hi</span>; }',
        };

        expect(validateSyntax(files)).toEqual([]);
    });

    it('allows JSX syntax in .js files', () => {
        const files = {
            'App.js': 'export default function App() { return <div>Hello</div>; }',
        };

        expect(validateSyntax(files)).toEqual([]);
    });

    it('skips non-code files', () => {
        const files = {
            'styles.css': 'body { margin: 0; }',
            'README.md': '# hello',
            'package.json': '{}',
        };

        expect(validateSyntax(files)).toEqual([]);
    });

    it('detects malformed TS/JS syntax', () => {
        const files = {
            'broken.ts': 'const fn = () => { return 1;',
        };

        const errors = validateSyntax(files);
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('syntax_error');
        expect(errors[0].filePath).toBe('broken.ts');
        expect(errors[0].line).toBeGreaterThanOrEqual(1);
        expect(errors[0].message.length).toBeGreaterThan(0);
    });

    it('detects malformed JSX structures', () => {
        const files = {
            'broken.jsx': 'export default function App() { return <div><span></div>; }',
        };

        const errors = validateSyntax(files);
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('syntax_error');
        expect(errors[0].filePath).toBe('broken.jsx');
    });

    it('reports line number from parser location', () => {
        const files = {
            'line-check.js': 'const a = 1;\nconst b = 2;\nfunction x() {\n  return (\n',
        };

        const errors = validateSyntax(files);
        expect(errors).toHaveLength(1);
        expect(errors[0].line).toBe(5);
    });

    it('returns one error per invalid file and keeps valid files clean', () => {
        const files = {
            'valid.ts': 'export const ok = true;',
            'invalid.tsx': 'export default function App() { return <div>; }',
        };

        const errors = validateSyntax(files);
        expect(errors).toHaveLength(1);
        expect(errors[0].filePath).toBe('invalid.tsx');
    });
});
