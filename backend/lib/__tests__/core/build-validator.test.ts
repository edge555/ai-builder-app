import { describe, it, expect } from 'vitest';
import { createBuildValidator } from '../../core/build-validator';

describe('BuildValidator', () => {
    const validator = createBuildValidator();

    describe('Validation Logic', () => {
        it('should validate a correct project', () => {
            const files = {
                'package.json': JSON.stringify({
                    dependencies: { 'lucide-react': '^0.263.1' }
                }),
                'src/App.tsx': `
                    import React from 'react';
                    import { Sparkles } from 'lucide-react';
                    import { Header } from './components/Header';
                    import './App.css';

                    export function App() {
                        return <div><Sparkles /><Header /></div>;
                    }
                `,
                'src/components/Header.tsx': `
                    export function Header() {
                        return <header>Header</header>;
                    }
                `,
                'src/App.css': '.app { color: red; }'
            };

            const result = validator.validate(files);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should detect missing dependencies', () => {
            const files = {
                'package.json': JSON.stringify({ dependencies: {} }),
                'index.tsx': "import axios from 'axios';"
            };

            const result = validator.validate(files);
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(expect.objectContaining({
                type: 'missing_dependency',
                message: expect.stringContaining("Package 'axios' is imported but not in package.json")
            }));
        });

        it('should detect broken relative imports', () => {
            const files = {
                'App.tsx': "import { Missing } from './Missing';"
            };

            const result = validator.validate(files);
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(expect.objectContaining({
                type: 'broken_import',
                message: "Cannot find module './Missing'"
            }));
        });

        it('should detect missing CSS files', () => {
            const files = {
                'App.tsx': "import './style.css';"
            };

            const result = validator.validate(files);
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(expect.objectContaining({
                type: 'missing_file',
                message: "CSS file not found: './style.css'"
            }));
        });

        it('should detect Node.js built-ins used in browser code', () => {
            const files = {
                'App.tsx': "import fs from 'fs';"
            };

            const result = validator.validate(files);
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(expect.objectContaining({
                type: 'missing_dependency',
                message: "Node.js module 'fs' cannot be used in browser code"
            }));
        });
    });

    describe('formatErrorsForAI', () => {
        it('should format building errors for AI consumption', () => {
            const errors = [
                {
                    type: 'missing_dependency' as const,
                    message: "Package 'lodash' missing",
                    file: 'App.tsx',
                    line: 5,
                    suggestion: "Add lodash to package.json"
                }
            ];

            const formatted = validator.formatErrorsForAI(errors);
            expect(formatted).toContain('=== BUILD ERRORS DETECTED ===');
            expect(formatted).toContain("Package 'lodash' missing");
            expect(formatted).toContain('App.tsx (line 5)');
            expect(formatted).toContain('Add lodash to package.json');
        });
    });
});
