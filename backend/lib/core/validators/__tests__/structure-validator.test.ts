import { describe, expect, it } from 'vitest';
import { validateProjectStructure } from '../structure-validator';

describe('Structure Validator', () => {
    describe('validateProjectStructure', () => {
        it('should return empty array for valid project structure', () => {
            const validFiles = {
                'package.json': JSON.stringify({
                    name: 'test-project',
                    dependencies: {},
                }),
                'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
            };
            const errors = validateProjectStructure(validFiles);
            expect(errors).toEqual([]);
        });

        it('should detect missing package.json', () => {
            const invalidFiles = {
                'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
            };
            const errors = validateProjectStructure(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'missing_structure',
                message: 'Missing package.json',
            });
        });

        it('should detect invalid package.json JSON', () => {
            const invalidFiles = {
                'package.json': '{ invalid json }',
                'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
            };
            const errors = validateProjectStructure(invalidFiles);
            expect(errors).toHaveLength(2);
            expect(errors[0]).toEqual({
                type: 'missing_structure',
                message: 'package.json is not valid JSON',
                filePath: 'package.json',
            });
            expect(errors[1]).toEqual({
                type: 'missing_structure',
                message: 'No entry point found. Expected one of: src/App.tsx, src/App.jsx, src/index.tsx, src/main.tsx',
            });
        });

        it('should detect missing name field in package.json', () => {
            const invalidFiles = {
                'package.json': JSON.stringify({
                    dependencies: {},
                }),
                'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
            };
            const errors = validateProjectStructure(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'missing_structure',
                message: 'package.json is missing "name" field',
                filePath: 'package.json',
            });
        });

        it('should detect missing dependencies field in package.json', () => {
            const invalidFiles = {
                'package.json': JSON.stringify({
                    name: 'test-project',
                }),
                'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
            };
            const errors = validateProjectStructure(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'missing_structure',
                message: 'package.json is missing "dependencies" field',
                filePath: 'package.json',
            });
        });

        it('should detect both missing name and dependencies fields', () => {
            const invalidFiles = {
                'package.json': JSON.stringify({
                    version: '1.0.0',
                }),
                'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
            };
            const errors = validateProjectStructure(invalidFiles);
            expect(errors).toHaveLength(2);
            expect(errors.some(e => e.message.includes('name'))).toBe(true);
            expect(errors.some(e => e.message.includes('dependencies'))).toBe(true);
        });

        it('should detect missing entry point', () => {
            const invalidFiles = {
                'package.json': JSON.stringify({
                    name: 'test-project',
                    dependencies: {},
                }),
                'src/utils.js': 'export function helper() {}',
            };
            const errors = validateProjectStructure(invalidFiles);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                type: 'missing_structure',
                message: 'No entry point found. Expected one of: src/App.tsx, src/App.jsx, src/index.tsx, src/main.tsx',
            });
        });

        it('should accept src/App.tsx as entry point', () => {
            const validFiles = {
                'package.json': JSON.stringify({
                    name: 'test-project',
                    dependencies: {},
                }),
                'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
            };
            const errors = validateProjectStructure(validFiles);
            expect(errors).toEqual([]);
        });

        it('should accept src/App.jsx as entry point', () => {
            const validFiles = {
                'package.json': JSON.stringify({
                    name: 'test-project',
                    dependencies: {},
                }),
                'src/App.jsx': 'export default function App() { return <div>Hello</div>; }',
            };
            const errors = validateProjectStructure(validFiles);
            expect(errors).toEqual([]);
        });

        it('should accept src/index.tsx as entry point', () => {
            const validFiles = {
                'package.json': JSON.stringify({
                    name: 'test-project',
                    dependencies: {},
                }),
                'src/index.tsx': 'export default function App() { return <div>Hello</div>; }',
            };
            const errors = validateProjectStructure(validFiles);
            expect(errors).toEqual([]);
        });

        it('should accept src/main.tsx as entry point', () => {
            const validFiles = {
                'package.json': JSON.stringify({
                    name: 'test-project',
                    dependencies: {},
                }),
                'src/main.tsx': 'export default function App() { return <div>Hello</div>; }',
            };
            const errors = validateProjectStructure(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle package.json in subdirectory', () => {
            const validFiles = {
                'app/package.json': JSON.stringify({
                    name: 'test-project',
                    dependencies: {},
                }),
                'app/src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
            };
            const errors = validateProjectStructure(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle entry point in subdirectory', () => {
            const validFiles = {
                'package.json': JSON.stringify({
                    name: 'test-project',
                    dependencies: {},
                }),
                'app/src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
            };
            const errors = validateProjectStructure(validFiles);
            expect(errors).toEqual([]);
        });

        it('should detect multiple errors', () => {
            const invalidFiles = {
                'package.json': JSON.stringify({
                    version: '1.0.0',
                }),
                'src/utils.js': 'export function helper() {}',
            };
            const errors = validateProjectStructure(invalidFiles);
            expect(errors.length).toBeGreaterThan(1);
            expect(errors.some(e => e.message.includes('name'))).toBe(true);
            expect(errors.some(e => e.message.includes('dependencies'))).toBe(true);
            expect(errors.some(e => e.message.includes('entry point'))).toBe(true);
        });

        it('should handle empty object', () => {
            const errors = validateProjectStructure({});
            expect(errors).toHaveLength(2);
            expect(errors[0]).toEqual({
                type: 'missing_structure',
                message: 'Missing package.json',
            });
            expect(errors[1]).toEqual({
                type: 'missing_structure',
                message: 'No entry point found. Expected one of: src/App.tsx, src/App.jsx, src/index.tsx, src/main.tsx',
            });
        });

        it('should handle package.json with empty string', () => {
            const invalidFiles = {
                'package.json': '',
                'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
            };
            const errors = validateProjectStructure(invalidFiles);
            expect(errors).toHaveLength(2);
            expect(errors[0]).toEqual({
                type: 'missing_structure',
                message: 'package.json is not valid JSON',
                filePath: 'package.json',
            });
        });

        it('should handle package.json with null', () => {
            const invalidFiles = {
                'package.json': 'null',
                'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
            };
            const errors = validateProjectStructure(invalidFiles);
            expect(errors).toHaveLength(2);
            expect(errors[0]).toEqual({
                type: 'missing_structure',
                message: 'package.json is missing "name" field',
                filePath: 'package.json',
            });
            expect(errors[1]).toEqual({
                type: 'missing_structure',
                message: 'package.json is missing "dependencies" field',
                filePath: 'package.json',
            });
        });

        it('should handle package.json with empty object', () => {
            const invalidFiles = {
                'package.json': '{}',
                'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
            };
            const errors = validateProjectStructure(invalidFiles);
            expect(errors).toHaveLength(2);
            expect(errors[0]).toEqual({
                type: 'missing_structure',
                message: 'package.json is missing "name" field',
                filePath: 'package.json',
            });
            expect(errors[1]).toEqual({
                type: 'missing_structure',
                message: 'package.json is missing "dependencies" field',
                filePath: 'package.json',
            });
        });

        it('should accept package.json with additional fields', () => {
            const validFiles = {
                'package.json': JSON.stringify({
                    name: 'test-project',
                    version: '1.0.0',
                    description: 'A test project',
                    dependencies: {},
                    devDependencies: {},
                    scripts: {
                        start: 'node index.js',
                    },
                }),
                'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
            };
            const errors = validateProjectStructure(validFiles);
            expect(errors).toEqual([]);
        });

        it('should accept package.json with empty dependencies object', () => {
            const validFiles = {
                'package.json': JSON.stringify({
                    name: 'test-project',
                    dependencies: {},
                }),
                'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
            };
            const errors = validateProjectStructure(validFiles);
            expect(errors).toEqual([]);
        });

        it('should accept package.json with dependencies', () => {
            const validFiles = {
                'package.json': JSON.stringify({
                    name: 'test-project',
                    dependencies: {
                        react: '^18.0.0',
                        'react-dom': '^18.0.0',
                    },
                }),
                'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
            };
            const errors = validateProjectStructure(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle multiple entry points', () => {
            const validFiles = {
                'package.json': JSON.stringify({
                    name: 'test-project',
                    dependencies: {},
                }),
                'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
                'src/index.tsx': 'export default function App() { return <div>Hello</div>; }',
            };
            const errors = validateProjectStructure(validFiles);
            expect(errors).toEqual([]);
        });

        it('should handle project with additional files', () => {
            const validFiles = {
                'package.json': JSON.stringify({
                    name: 'test-project',
                    dependencies: {},
                }),
                'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
                'src/utils.js': 'export function helper() {}',
                'styles.css': 'body { margin: 0; }',
                'README.md': '# Test Project',
            };
            const errors = validateProjectStructure(validFiles);
            expect(errors).toEqual([]);
        });
    });
});
