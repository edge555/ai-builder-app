/**
 * Tests for core/build-validator module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BuildValidator, createBuildValidator } from '../build-validator';

// Mock the logger
vi.mock('../../logger', () => ({
    createLogger: vi.fn(() => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        withRequestId: vi.fn(),
    })),
}));

describe('BuildValidator', () => {
    let validator: BuildValidator;

    beforeEach(() => {
        validator = new BuildValidator();
    });

    // ─── Happy path ───────────────────────────────────────────────────────────

    it('returns valid for empty file set', () => {
        const result = validator.validate({});
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('returns valid when all deps are declared in package.json', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' } }),
            'src/App.tsx': `import React from 'react';\nexport default function App() { return null; }`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(true);
    });

    it('returns valid for files with no imports', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/utils.ts': 'export const add = (a: number, b: number) => a + b;',
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(true);
    });

    it('skips non-JS/TS files', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'README.md': '# My App\nimport foo from "bar"',
            'styles.css': 'body { margin: 0; }',
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(true);
    });

    // ─── Missing dependency ───────────────────────────────────────────────────

    it('detects missing npm dependency', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `import axios from 'axios';\nexport default function App() { return null; }`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(false);
        const err = result.errors[0];
        expect(err.type).toBe('missing_dependency');
        expect(err.file).toBe('src/App.tsx');
        expect(err.severity).toBe('fixable');
        expect(err.message).toContain('axios');
    });

    it('provides specific suggestion for well-known packages', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `import { v4 } from 'uuid';\nexport default function App() { return null; }`,
        };
        const result = validator.validate(files);
        expect(result.errors[0].suggestion).toContain('crypto.randomUUID');
    });

    it('accepts packages declared in devDependencies', () => {
        const files = {
            'package.json': JSON.stringify({ devDependencies: { lodash: '^4.0.0' } }),
            'src/util.ts': `import _ from 'lodash';\nexport default _;`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(true);
    });

    it('accepts packages declared in peerDependencies', () => {
        const files = {
            'package.json': JSON.stringify({ peerDependencies: { react: '^18.0.0' } }),
            'src/App.tsx': `import React from 'react';\nexport default function App() { return null; }`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(true);
    });

    // ─── Node.js built-ins ────────────────────────────────────────────────────

    it('flags Node.js built-in fs as unfixable', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `import fs from 'fs';\nexport default function App() { return null; }`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(false);
        const err = result.errors[0];
        expect(err.type).toBe('missing_dependency');
        expect(err.severity).toBe('unfixable');
        expect(err.message).toContain('cannot be used in browser code');
    });

    it('flags node: prefix imports as unfixable', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `import { readFile } from 'node:fs/promises';\nexport default function App() { return null; }`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(false);
        expect(result.errors[0].severity).toBe('unfixable');
    });

    it('flags multiple Node.js built-ins', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `import fs from 'fs';\nimport path from 'path';\nexport default function App() { return null; }`,
        };
        const result = validator.validate(files);
        expect(result.errors).toHaveLength(2);
        expect(result.errors.every(e => e.severity === 'unfixable')).toBe(true);
    });

    // ─── Scoped packages ──────────────────────────────────────────────────────

    it('correctly handles scoped package name extraction', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `import { something } from '@scope/package';\nexport default function App() { return null; }`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(false);
        expect(result.errors[0].message).toContain('@scope/package');
    });

    it('accepts declared scoped packages', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: { '@scope/package': '^1.0.0' } }),
            'src/App.tsx': `import { something } from '@scope/package/sub-path';\nexport default function App() { return null; }`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(true);
    });

    // ─── Path aliases ─────────────────────────────────────────────────────────

    it('skips @/ path alias imports', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `import { Foo } from '@/components/Foo';\nexport default function App() { return null; }`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(true);
    });

    it('skips ~/ path alias imports', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `import { Bar } from '~/utils/bar';\nexport default function App() { return null; }`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(true);
    });

    // ─── Relative imports ─────────────────────────────────────────────────────

    it('validates relative imports that exist', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `import { helper } from './utils';\nexport default function App() { return null; }`,
            'src/utils.ts': 'export const helper = () => {};',
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(true);
    });

    it('detects broken relative import', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `import { helper } from './does-not-exist';\nexport default function App() { return null; }`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(false);
        const err = result.errors[0];
        expect(err.type).toBe('broken_import');
        expect(err.severity).toBe('fixable');
        expect(err.message).toContain('./does-not-exist');
    });

    it('resolves relative imports with .tsx extension', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `import Button from './Button';\nexport default function App() { return null; }`,
            'src/Button.tsx': `export default function Button() { return null; }`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(true);
    });

    it('resolves relative imports to index files', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `import { Comp } from './components';\nexport default function App() { return null; }`,
            'src/components/index.ts': 'export const Comp = () => {};',
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(true);
    });

    it('resolves ../ relative imports', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/components/Button.tsx': `import { helper } from '../utils';\nexport default function Button() { return null; }`,
            'src/utils.ts': 'export const helper = () => {};',
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(true);
    });

    // ─── CSS / asset imports ──────────────────────────────────────────────────

    it('flags missing relative CSS file', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `import './App.css';\nexport default function App() { return null; }`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(false);
        expect(result.errors[0].type).toBe('missing_file');
    });

    it('accepts existing relative CSS file', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `import './App.css';\nexport default function App() { return null; }`,
            'src/App.css': 'body { margin: 0; }',
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(true);
    });

    it('skips other asset imports (svg, png, json) without checking existence', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `import logo from './logo.svg';\nimport data from './data.json';\nexport default function App() { return null; }`,
        };
        const result = validator.validate(files);
        // Only CSS is checked for existence, others are silently skipped
        expect(result.valid).toBe(true);
    });

    // ─── Built-in React modules ───────────────────────────────────────────────

    it('accepts react imports without package.json declaration', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nexport default function App() { return null; }`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(true);
    });

    it('accepts react/jsx-runtime', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `import { jsx } from 'react/jsx-runtime';\nexport default function App() { return null; }`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(true);
    });

    // ─── Import/export mismatch ───────────────────────────────────────────────

    it('detects default import from module with no default export', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `import Util from './utils';\nexport default function App() { return null; }`,
            'src/utils.ts': `export const helper = () => {};`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(false);
        const err = result.errors[0];
        expect(err.type).toBe('import_export_mismatch');
        expect(err.severity).toBe('fixable');
        expect(err.message).toContain('no default export');
    });

    it('accepts default import from module with default export', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `import Button from './Button';\nexport default function App() { return null; }`,
            'src/Button.tsx': `export default function Button() { return null; }`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(true);
    });

    it('accepts export { X as default } pattern', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `import Comp from './Comp';\nexport default function App() { return null; }`,
            'src/Comp.tsx': `function Comp() { return null; }\nexport { Comp as default };`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(true);
    });

    it('does not flag named imports even if no default export', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `import { helper } from './utils';\nexport default function App() { return null; }`,
            'src/utils.ts': `export const helper = () => {};`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(true);
    });

    // ─── Multi-line imports ───────────────────────────────────────────────────

    it('handles multi-line import statements', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `import {\n  useState,\n  useEffect\n} from 'react';\nexport default function App() { return null; }`,
        };
        const result = validator.validate(files);
        // react is a built-in, should not fail
        expect(result.valid).toBe(true);
    });

    it('detects missing dep in multi-line import', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `import {\n  format,\n  parse\n} from 'date-fns';\nexport default function App() { return null; }`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(false);
        expect(result.errors[0].message).toContain('date-fns');
    });

    // ─── require() and dynamic import() ──────────────────────────────────────

    it('detects missing dep in require() call', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/util.ts': `const moment = require('moment');\nexport default moment;`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(false);
        expect(result.errors[0].message).toContain('moment');
    });

    it('detects missing dep in dynamic import()', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/util.ts': `async function load() { return import('chart.js'); }\nexport default load;`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(false);
        expect(result.errors[0].message).toContain('chart.js');
    });

    // ─── Line numbers ─────────────────────────────────────────────────────────

    it('includes correct line number in error', () => {
        const files = {
            'package.json': JSON.stringify({ dependencies: {} }),
            'src/App.tsx': `// comment\nimport axios from 'axios';\nexport default function App() { return null; }`,
        };
        const result = validator.validate(files);
        expect(result.errors[0].line).toBe(2);
    });

    // ─── formatErrorsForAI ────────────────────────────────────────────────────

    describe('formatErrorsForAI', () => {
        it('returns empty string when no errors', () => {
            const result = validator.formatErrorsForAI([]);
            expect(result).toBe('');
        });

        it('formats errors with file and message', () => {
            const errors = [
                {
                    type: 'missing_dependency' as const,
                    message: "Package 'axios' is imported but not in package.json",
                    file: 'src/App.tsx',
                    line: 2,
                    suggestion: "Add 'axios' to package.json dependencies",
                    severity: 'fixable' as const,
                },
            ];
            const result = validator.formatErrorsForAI(errors);
            expect(result).toContain('BUILD ERRORS DETECTED');
            expect(result).toContain('axios');
            expect(result).toContain('src/App.tsx');
            expect(result).toContain('line 2');
            expect(result).toContain('Add');
        });

        it('formats errors without line number', () => {
            const errors = [
                {
                    type: 'missing_dependency' as const,
                    message: "Package 'foo' is imported but not in package.json",
                    file: 'src/App.tsx',
                    severity: 'fixable' as const,
                },
            ];
            const result = validator.formatErrorsForAI(errors);
            expect(result).not.toContain('line');
            expect(result).toContain('src/App.tsx');
        });

        it('includes instructions for fixing errors', () => {
            const errors = [
                {
                    type: 'missing_dependency' as const,
                    message: "Package 'foo' is missing",
                    file: 'src/App.tsx',
                    severity: 'fixable' as const,
                },
            ];
            const result = validator.formatErrorsForAI(errors);
            expect(result).toContain('package.json');
            expect(result).toContain('native browser APIs');
        });
    });

    // ─── createBuildValidator ─────────────────────────────────────────────────

    it('createBuildValidator returns a BuildValidator instance', () => {
        const instance = createBuildValidator();
        expect(instance).toBeInstanceOf(BuildValidator);
    });

    // ─── package.json without package ─────────────────────────────────────────

    it('treats missing package.json as no declared deps', () => {
        const files = {
            'src/App.tsx': `import axios from 'axios';\nexport default function App() { return null; }`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(false);
        expect(result.errors[0].type).toBe('missing_dependency');
    });

    it('handles malformed package.json gracefully', () => {
        const files = {
            'package.json': '{ invalid json',
            'src/App.tsx': `import axios from 'axios';\nexport default function App() { return null; }`,
        };
        // Should not throw; treats as no deps
        const result = validator.validate(files);
        expect(result.valid).toBe(false);
        expect(result.errors[0].type).toBe('missing_dependency');
    });

    it('handles package.json with no dependencies field', () => {
        const files = {
            'package.json': JSON.stringify({ name: 'my-app', version: '1.0.0' }),
            'src/App.tsx': `import axios from 'axios';\nexport default function App() { return null; }`,
        };
        const result = validator.validate(files);
        expect(result.valid).toBe(false);
    });

    // ─── Cross-file reference validation ─────────────────────────────────────

    describe('validateCrossFileReferences', () => {
        it('should detect missing named export', () => {
            const files = {
                'src/App.tsx': "import { Helper } from './utils';\nexport default function App() { return null; }",
                'src/utils.ts': 'export const NotHelper = () => {};',
            };

            const errors = validator.validateCrossFileReferences(files);
            expect(errors.length).toBe(1);
            expect(errors[0].type).toBe('import_export_mismatch');
            expect(errors[0].message).toContain('Helper');
            expect(errors[0].message).toContain('not exported');
        });

        it('should not false-positive on barrel file (export *)', () => {
            const files = {
                'src/App.tsx': "import { Widget } from './components';\nexport default function App() { return null; }",
                'src/components/index.ts': "export * from './Widget';",
                'src/components/Widget.ts': 'export const Widget = () => {};',
            };

            const errors = validator.validateCrossFileReferences(files);
            expect(errors.length).toBe(0);
        });

        it('should not false-positive on re-export', () => {
            const files = {
                'src/App.tsx': "import { format } from './utils';\nexport default function App() { return null; }",
                'src/utils.ts': "export { format } from './helpers';",
                'src/helpers.ts': 'export const format = (x: string) => x;',
            };

            const errors = validator.validateCrossFileReferences(files);
            expect(errors.length).toBe(0);
        });

        it('should not false-positive on type-only import', () => {
            const files = {
                'src/App.tsx': "import type { User } from './types';\nexport default function App() { return null; }",
                'src/types.ts': 'export interface User { id: string; }',
            };

            // type-only imports are skipped entirely
            const errors = validator.validateCrossFileReferences(files);
            expect(errors.length).toBe(0);
        });

        it('should handle import { X as Y } alias correctly', () => {
            const files = {
                'src/App.tsx': "import { helper as myHelper } from './utils';\nexport default function App() { return null; }",
                'src/utils.ts': 'export const helper = () => {};',
            };

            const errors = validator.validateCrossFileReferences(files);
            expect(errors.length).toBe(0);
        });

        it('should detect error when aliased import source does not exist', () => {
            const files = {
                'src/App.tsx': "import { missing as alias } from './utils';\nexport default function App() { return null; }",
                'src/utils.ts': 'export const something = () => {};',
            };

            const errors = validator.validateCrossFileReferences(files);
            expect(errors.length).toBe(1);
            expect(errors[0].message).toContain('missing');
        });

        it('should handle combo default + named imports', () => {
            const files = {
                'src/App.tsx': "import App, { helper } from './utils';\nexport default function Main() { return null; }",
                'src/utils.ts': 'export default function App() {}\nexport const helper = () => {};',
            };

            const errors = validator.validateCrossFileReferences(files);
            expect(errors.length).toBe(0);
        });

        // ─── New package import → verify in package.json ─────────────────

        it('should detect package import not in package.json', () => {
            const files = {
                'src/App.tsx': "import { motion } from 'framer-motion';\nexport default function App() { return null; }",
                'package.json': JSON.stringify({ name: 'test', dependencies: { react: '^18.2.0' } }),
            };

            const errors = validator.validateCrossFileReferences(files);
            const depErrors = errors.filter(e => e.type === 'missing_dependency');
            expect(depErrors.length).toBe(1);
            expect(depErrors[0].message).toContain('framer-motion');
            expect(depErrors[0].message).toContain('not declared in package.json');
        });

        it('should not flag package that is in package.json', () => {
            const files = {
                'src/App.tsx': "import { motion } from 'framer-motion';\nexport default function App() { return null; }",
                'package.json': JSON.stringify({ name: 'test', dependencies: { 'framer-motion': 'latest' } }),
            };

            const errors = validator.validateCrossFileReferences(files);
            const depErrors = errors.filter(e => e.type === 'missing_dependency');
            expect(depErrors.length).toBe(0);
        });

        it('should not flag react (built-in module)', () => {
            const files = {
                'src/App.tsx': "import { useState } from 'react';\nexport default function App() { return null; }",
                'package.json': JSON.stringify({ name: 'test', dependencies: {} }),
            };

            const errors = validator.validateCrossFileReferences(files);
            const depErrors = errors.filter(e => e.type === 'missing_dependency');
            expect(depErrors.length).toBe(0);
        });

        it('should not flag path alias imports (@/)', () => {
            const files = {
                'src/App.tsx': "import { helper } from '@/utils';\nexport default function App() { return null; }",
                'package.json': JSON.stringify({ name: 'test', dependencies: {} }),
            };

            const errors = validator.validateCrossFileReferences(files);
            const depErrors = errors.filter(e => e.type === 'missing_dependency');
            expect(depErrors.length).toBe(0);
        });

        // ─── Removed export → verify no other file imports it ────────────

        it('should detect removed export still imported by another file', () => {
            const files = {
                'src/App.tsx': "import { formatDate } from './utils';\nexport default function App() { return null; }",
                'src/utils.ts': 'export const formatName = (n: string) => n;',  // formatDate was removed
            };

            const errors = validator.validateCrossFileReferences(files);
            expect(errors.some(e =>
                e.type === 'import_export_mismatch' &&
                e.message.includes('formatDate')
            )).toBe(true);
        });

        it('should not flag when export still exists', () => {
            const files = {
                'src/App.tsx': "import { formatDate } from './utils';\nexport default function App() { return null; }",
                'src/utils.ts': 'export const formatDate = (d: Date) => d.toISOString();',
            };

            const errors = validator.validateCrossFileReferences(files);
            expect(errors.filter(e => e.message.includes('formatDate')).length).toBe(0);
        });

        it('should detect removed export through barrel file', () => {
            const files = {
                'src/App.tsx': "import { Widget } from './components';\nexport default function App() { return null; }",
                'src/components/index.ts': "export * from './Widget';",
                'src/components/Widget.ts': 'export const OtherThing = () => {};',  // Widget was renamed
            };

            const errors = validator.validateCrossFileReferences(files);
            expect(errors.some(e =>
                e.type === 'import_export_mismatch' &&
                e.message.includes('Widget')
            )).toBe(true);
        });
    });
});
