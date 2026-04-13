import { describe, expect, it } from 'vitest';
import { validateCssSyntax, validateCssClassConsistency } from '../css-validator';

describe('CSS Validator', () => {
    describe('validateCssSyntax', () => {
        it('returns no errors for valid CSS', () => {
            const files = {
                'src/styles.css': '.card { color: red; } .title { font-size: 16px; }',
            };

            expect(validateCssSyntax(files)).toEqual([]);
        });

        it('detects unclosed CSS block', () => {
            const files = {
                'src/styles.css': '.card { color: red;',
            };

            const errors = validateCssSyntax(files);
            expect(errors).toHaveLength(1);
            expect(errors[0].type).toBe('syntax_error');
            expect(errors[0].message).toContain('Unclosed CSS block');
            expect(errors[0].filePath).toBe('src/styles.css');
        });

        it('detects unexpected closing brace', () => {
            const files = {
                'src/styles.css': '.card { color: red; }}',
            };

            const errors = validateCssSyntax(files);
            expect(errors.some((e) => e.message.includes('Unexpected closing brace'))).toBe(true);
        });

        it('detects unclosed comment', () => {
            const files = {
                'src/styles.css': '/* comment\n.card { color: red; }',
            };

            const errors = validateCssSyntax(files);
            expect(errors.some((e) => e.message.includes('Unclosed CSS comment'))).toBe(true);
        });
    });

    describe('validateCssClassConsistency', () => {
        it('warns when className is missing from CSS selectors', () => {
            const files = {
                'src/App.tsx': 'import "./styles.css"; export default function App(){ return <div className="missing-class" />; }',
                'src/styles.css': '.present-class { color: red; }',
            };

            const warnings = validateCssClassConsistency(files);
            expect(warnings).toHaveLength(1);
            expect(warnings[0].type).toBe('styling_warning');
            expect(warnings[0].message).toContain('missing-class');
            expect(warnings[0].filePath).toBe('src/App.tsx');
        });

        it('does not warn when classes are defined', () => {
            const files = {
                'src/App.tsx': 'import "./styles.css"; export default function App(){ return <div className="card title" />; }',
                'src/styles.css': '.card { color: red; } .title { font-weight: 700; }',
            };

            expect(validateCssClassConsistency(files)).toEqual([]);
        });

        it('ignores files without local CSS imports', () => {
            const files = {
                'src/App.tsx': 'export default function App(){ return <div className="missing-class" />; }',
                'src/styles.css': '.present-class { color: red; }',
            };

            expect(validateCssClassConsistency(files)).toEqual([]);
        });

        it('skips class consistency checks for tailwind projects', () => {
            const files = {
                'tailwind.config.js': 'module.exports = {}',
                'src/App.tsx': 'import "./styles.css"; export default function App(){ return <div className="missing-class" />; }',
                'src/styles.css': '@tailwind base; @tailwind components; @tailwind utilities;',
            };

            expect(validateCssClassConsistency(files)).toEqual([]);
        });
    });
});
