/**
 * @module core/build-validator
 * @description Validates AI-generated code for common build issues before delivery.
 * Checks for missing package.json dependencies, broken relative imports, and
 * Node.js built-in modules used in browser code. Provides formatted error messages
 * for AI auto-correction.
 *
 * @requires ../logger - Error logging for unparseable package.json
 */

import { createLogger } from '../logger';

const logger = createLogger('core/build-validator');

export interface BuildError {
    type: 'missing_dependency' | 'broken_import' | 'syntax_error' | 'missing_file' | 'import_export_mismatch';
    message: string;
    file: string;
    line?: number;
    suggestion?: string;
    /** Whether this error can be fixed by AI retry. Node.js built-in usage is unfixable. */
    severity: 'fixable' | 'unfixable';
}

export interface BuildValidationResult {
    valid: boolean;
    errors: BuildError[];
}

/**
 * Core React/Vite dependencies that are always available
 */
const BUILT_IN_MODULES = new Set([
    'react',
    'react-dom',
    'react-dom/client',
    'react/jsx-runtime',
]);

/**
 * File extensions treated as static assets (CSS, images, data files)
 */
const ASSET_EXTENSIONS = ['.css', '.scss', '.png', '.svg', '.jpg', '.json'];

/**
 * Specific suggestions for common packages that have browser-native alternatives
 */
const PACKAGE_SUGGESTIONS: Record<string, string> = {
    uuid: 'Use crypto.randomUUID() instead of uuid package, or add uuid to package.json',
    lodash: 'Use native JavaScript methods instead, or add lodash to package.json',
    underscore: 'Use native JavaScript methods instead, or add underscore to package.json',
    moment: 'Use native Date or Intl.DateTimeFormat instead, or add moment to package.json',
    axios: 'Use native fetch() instead, or add axios to package.json',
};

/**
 * Node.js built-in modules (shouldn't be used in browser code)
 */
const NODE_BUILT_INS = new Set([
    'fs', 'path', 'os', 'crypto', 'http', 'https', 'stream', 'buffer',
    'util', 'events', 'child_process', 'cluster', 'dgram', 'dns', 'net',
    'readline', 'repl', 'tls', 'tty', 'url', 'v8', 'vm', 'zlib',
]);

// Match various import patterns
const IMPORT_PATTERNS = [
    // import X from 'module'
    // import { X } from 'module'
    // import * as X from 'module'
    /^\s*import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/,
    // import 'module' (side-effect imports)
    /^\s*import\s+['"]([^'"]+)['"]/,
    // require('module')
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/,
    // dynamic import('module')
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/,
];

/**
 * Extract imports from a TypeScript/JavaScript file.
 * Handles multi-line static imports by joining continuation lines before pattern matching.
 */
function extractImports(content: string): Array<{ module: string; line: number }> {
    const imports: Array<{ module: string; line: number }> = [];
    const lines = content.split('\n');

    // Returns true once the line contains a quoted module path (e.g. 'react' or "lodash")
    const hasQuotedString = (s: string) => /['"][^'"]+['"]/.test(s);

    let i = 0;
    while (i < lines.length) {
        let line = lines[i];
        const startLine = i + 1;

        // Join multi-line static imports: `import { X,\n  Y\n} from 'module'`
        // Triggered when the line starts with `import` but has no quoted module path yet.
        if (/^\s*import\s/.test(line) && !hasQuotedString(line)) {
            while (i + 1 < lines.length && !hasQuotedString(line)) {
                i++;
                line = line.trimEnd() + ' ' + lines[i].trimStart();
            }
        }

        for (const pattern of IMPORT_PATTERNS) {
            const match = line.match(pattern);
            if (match) {
                imports.push({ module: match[1], line: startLine });
                break;
            }
        }

        i++;
    }

    return imports;
}

/**
 * Check if a file has a default export.
 * Matches: export default function/class/X, export { X as default }
 */
function hasDefaultExport(content: string): boolean {
    const lines = content.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        // Skip comments
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

        // export default function/class/expression
        if (/^export\s+default\s+/.test(trimmed)) return true;
        // export { X as default } or export { default }
        if (/^export\s*\{[^}]*\bdefault\b/.test(trimmed)) return true;
    }
    return false;
}

/**
 * Extract default import targets from a file.
 * Returns pairs of { importedName, module, line } for default imports from relative paths.
 * Matches: import Foo from './Bar'
 * Does NOT match: import { Foo } from './Bar' or import * as Foo from './Bar'
 */
function extractDefaultImports(content: string): Array<{ importedName: string; module: string; line: number }> {
    const results: Array<{ importedName: string; module: string; line: number }> = [];
    const lines = content.split('\n');

    const hasQuotedString = (s: string) => /['"][^'"]+['"]/.test(s);

    let i = 0;
    while (i < lines.length) {
        let line = lines[i];
        const startLine = i + 1;

        // Join multi-line imports
        if (/^\s*import\s/.test(line) && !hasQuotedString(line)) {
            while (i + 1 < lines.length && !hasQuotedString(line)) {
                i++;
                line = line.trimEnd() + ' ' + lines[i].trimStart();
            }
        }

        // Match: import DefaultName from './path'
        // Must NOT start with { or * (those are named/namespace imports)
        const match = line.match(/^\s*import\s+([A-Z_$][\w$]*)\s+from\s+['"](\.[^'"]+)['"]/);
        if (match) {
            results.push({ importedName: match[1], module: match[2], line: startLine });
        }

        // Also match: import DefaultName, { named } from './path'
        const comboMatch = line.match(/^\s*import\s+([A-Z_$][\w$]*)\s*,\s*\{[^}]*\}\s+from\s+['"](\.[^'"]+)['"]/);
        if (comboMatch && !match) {
            results.push({ importedName: comboMatch[1], module: comboMatch[2], line: startLine });
        }

        i++;
    }

    return results;
}

/**
 * Parse package.json to get declared dependencies
 */
function parseDependencies(packageJsonContent: string): Set<string> {
    const deps = new Set<string>();

    try {
        const pkg = JSON.parse(packageJsonContent);

        // Add all dependencies
        if (pkg.dependencies) {
            Object.keys(pkg.dependencies).forEach(dep => deps.add(dep));
        }
        if (pkg.devDependencies) {
            Object.keys(pkg.devDependencies).forEach(dep => deps.add(dep));
        }
        if (pkg.peerDependencies) {
            Object.keys(pkg.peerDependencies).forEach(dep => deps.add(dep));
        }
    } catch (e) {
        logger.error('Failed to parse package.json', {
            error: e instanceof Error ? e.message : String(e),
        });
    }

    return deps;
}

/**
 * Check if an import is a local/relative import
 */
function isRelativeImport(modulePath: string): boolean {
    return modulePath.startsWith('./') || modulePath.startsWith('../');
}

/**
 * Normalize file path for comparison
 */
function normalizePath(path: string): string {
    return path.replace(/\\/g, '/').toLowerCase();
}

/**
 * Resolve a relative import to a file path
 */
function resolveRelativeImport(
    fromFile: string,
    importPath: string,
    normalizedFilesSet: Set<string>
): string | null {
    // Get directory of the importing file
    const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/'));

    // Resolve the import path
    let resolved = importPath;
    if (importPath.startsWith('./')) {
        resolved = `${fromDir}/${importPath.slice(2)}`;
    } else if (importPath.startsWith('../')) {
        const parts = fromDir.split('/');
        let upCount = 0;
        let remaining = importPath;
        while (remaining.startsWith('../')) {
            upCount++;
            remaining = remaining.slice(3);
        }
        parts.splice(parts.length - upCount, upCount);
        resolved = `${parts.join('/')}/${remaining}`;
    }

    // Normalize the resolved path
    resolved = normalizePath(resolved);

    // Try exact match
    if (normalizedFilesSet.has(resolved)) {
        return resolved;
    }

    // Try with common extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.css'];
    for (const ext of extensions) {
        if (normalizedFilesSet.has(resolved + ext)) {
            return resolved + ext;
        }
    }

    // Try as directory with index file
    for (const ext of extensions) {
        if (normalizedFilesSet.has(`${resolved}/index${ext}`)) {
            return `${resolved}/index${ext}`;
        }
    }

    return null;
}

/**
 * Get package name from an import (handles scoped packages)
 */
function getPackageName(importPath: string): string {
    if (importPath.startsWith('@')) {
        // Scoped package: @scope/package
        const parts = importPath.split('/');
        return parts.slice(0, 2).join('/');
    }
    // Regular package: get first part before /
    return importPath.split('/')[0];
}

/**
 * BuildValidator class for service-oriented usage
 */
export class BuildValidator {
    /**
     * Validate generated files for build issues
     */
    validate(files: Record<string, string>): BuildValidationResult {
        const errors: BuildError[] = [];
        const allFilePaths = Object.keys(files);
        const normalizedFilesSet = new Set(allFilePaths.map(f => normalizePath(f)));

        logger.debug('Starting build validation', { fileCount: allFilePaths.length });

        // Find package.json
        const packageJsonPath = allFilePaths.find(p => p.endsWith('package.json'));
        const declaredDeps = packageJsonPath
            ? parseDependencies(files[packageJsonPath])
            : new Set<string>();

        logger.debug('Dependency check', {
            hasPackageJson: !!packageJsonPath,
            declaredDepCount: declaredDeps.size,
        });

        // Add built-in React modules
        BUILT_IN_MODULES.forEach(m => declaredDeps.add(m));

        // Scan each TypeScript/JavaScript file
        for (const [filePath, content] of Object.entries(files)) {
            const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
            if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
                continue;
            }

            const imports = extractImports(content);

            for (const { module: importPath, line } of imports) {
                // Skip CSS/asset imports
                const isAssetImport = ASSET_EXTENSIONS.some(ext => importPath.endsWith(ext));
                if (isAssetImport) {
                    // For CSS imports, check if the file exists
                    if (importPath.endsWith('.css') && isRelativeImport(importPath)) {
                        const resolved = resolveRelativeImport(filePath, importPath, normalizedFilesSet);
                        if (!resolved) {
                            errors.push({
                                type: 'missing_file',
                                message: `CSS file not found: '${importPath}'`,
                                file: filePath,
                                line,
                                suggestion: `Create the CSS file or remove the import`,
                                severity: 'fixable',
                            });
                        }
                    }
                    continue;
                }

                if (isRelativeImport(importPath)) {
                    // Check if relative import resolves to existing file
                    const resolved = resolveRelativeImport(filePath, importPath, normalizedFilesSet);
                    if (!resolved) {
                        errors.push({
                            type: 'broken_import',
                            message: `Cannot find module '${importPath}'`,
                            file: filePath,
                            line,
                            suggestion: `Check if the file exists or fix the import path`,
                            severity: 'fixable',
                        });
                    }
                } else {
                    // Path-alias imports (e.g. @/ or ~) are resolved by the bundler — skip
                    if (importPath.startsWith('@/') || importPath.startsWith('~/')) {
                        continue;
                    }

                    // External package import
                    // Strip `node:` prefix (e.g. `node:fs` → `fs`) before classification
                    const rawImport = importPath.startsWith('node:') ? importPath.slice(5) : importPath;
                    const packageName = getPackageName(rawImport);

                    // Check if it's a Node.js built-in (not usable in browser)
                    if (NODE_BUILT_INS.has(packageName)) {
                        errors.push({
                            type: 'missing_dependency',
                            message: `Node.js module '${packageName}' cannot be used in browser code`,
                            file: filePath,
                            line,
                            suggestion: `Use a browser-compatible alternative`,
                            severity: 'unfixable',
                        });
                        continue;
                    }

                    // Check if package is declared in dependencies
                    if (!declaredDeps.has(packageName)) {
                        // Provide specific suggestions for common packages
                        const suggestion = PACKAGE_SUGGESTIONS[packageName] ?? `Add '${packageName}' to package.json dependencies`;

                        errors.push({
                            type: 'missing_dependency',
                            message: `Package '${packageName}' is imported but not in package.json`,
                            file: filePath,
                            line,
                            suggestion,
                            severity: 'fixable',
                        });
                    }
                }
            }
        }

        // Check default import/export consistency
        for (const [filePath, content] of Object.entries(files)) {
            const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
            if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) continue;

            const defaultImports = extractDefaultImports(content);
            for (const { importedName, module: importPath, line } of defaultImports) {
                const resolved = resolveRelativeImport(filePath, importPath, normalizedFilesSet);
                if (!resolved) continue; // Already caught by broken_import check

                // Find the actual file content (case-insensitive match via normalized path)
                const actualPath = allFilePaths.find(p => normalizePath(p) === resolved);
                if (!actualPath) continue;

                const targetContent = files[actualPath];
                if (!hasDefaultExport(targetContent)) {
                    errors.push({
                        type: 'import_export_mismatch',
                        message: `'${actualPath}' has no default export, but '${filePath}' imports it as default (import ${importedName})`,
                        file: filePath,
                        line,
                        suggestion: `Add 'export default ${importedName}' to '${actualPath}', or change to a named import: import { ${importedName} } from '${importPath}'`,
                        severity: 'fixable',
                    });
                }
            }
        }

        if (errors.length > 0) {
            logger.warn('Build validation found issues', {
                errorCount: errors.length,
                errorTypes: [...new Set(errors.map(e => e.type))],
                fixableCount: errors.filter(e => e.severity === 'fixable').length,
                unfixableCount: errors.filter(e => e.severity === 'unfixable').length,
            });
        } else {
            logger.debug('Build validation passed', { fileCount: allFilePaths.length });
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    /**
     * Format build errors for sending to AI for fixing
     */
    formatErrorsForAI(errors: BuildError[]): string {
        if (errors.length === 0) return '';

        let formatted = '=== BUILD ERRORS DETECTED ===\n\n';
        formatted += 'The following errors were found in the generated code:\n\n';

        for (const error of errors) {
            formatted += `ERROR: ${error.message}\n`;
            formatted += `  File: ${error.file}${error.line ? ` (line ${error.line})` : ''}\n`;
            if (error.suggestion) {
                formatted += `  Suggestion: ${error.suggestion}\n`;
            }
            formatted += '\n';
        }

        formatted += 'Please fix these errors in your response.\n';
        formatted += 'Make sure all imported packages are either:\n';
        formatted += '1. Added to package.json dependencies\n';
        formatted += '2. Local files that exist in the project\n';
        formatted += '3. Replaced with native browser APIs\n';

        return formatted;
    }
}

/**
 * Creates a new BuildValidator instance.
 */
export function createBuildValidator(): BuildValidator {
    return new BuildValidator();
}
