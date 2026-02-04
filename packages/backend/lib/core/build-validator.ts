/**
 * Build Validator Service
 * 
 * Validates generated code for common build issues:
 * - Missing dependencies (imports not in package.json)
 * - Broken local imports (files that don't exist)
 * - Basic syntax validation
 * 
 * Used for auto-retry loop when build errors are detected.
 */

import { createLogger } from '../logger';

const logger = createLogger('build-validator');

export interface BuildError {
    type: 'missing_dependency' | 'broken_import' | 'syntax_error' | 'missing_file';
    message: string;
    file: string;
    line?: number;
    suggestion?: string;
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
 * Extract imports from a TypeScript/JavaScript file
 */
function extractImports(content: string): Array<{ module: string; line: number }> {
    const imports: Array<{ module: string; line: number }> = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const pattern of IMPORT_PATTERNS) {
            const match = line.match(pattern);
            if (match) {
                imports.push({ module: match[1], line: i + 1 });
                break;
            }
        }
    }

    return imports;
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
    allFiles: string[]
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

    // Check if the exact file exists
    const normalizedFiles = allFiles.map(f => normalizePath(f));

    // Try exact match
    if (normalizedFiles.includes(resolved)) {
        return resolved;
    }

    // Try with common extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.css'];
    for (const ext of extensions) {
        if (normalizedFiles.includes(resolved + ext)) {
            return resolved + ext;
        }
    }

    // Try as directory with index file
    for (const ext of extensions) {
        if (normalizedFiles.includes(`${resolved}/index${ext}`)) {
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
 * Validate generated files for build issues
 */
export function validateBuild(files: Record<string, string>): BuildValidationResult {
    const errors: BuildError[] = [];
    const allFilePaths = Object.keys(files);

    // Find package.json
    const packageJsonPath = allFilePaths.find(p => p.endsWith('package.json'));
    const declaredDeps = packageJsonPath
        ? parseDependencies(files[packageJsonPath])
        : new Set<string>();

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
            if (importPath.endsWith('.css') || importPath.endsWith('.scss') ||
                importPath.endsWith('.png') || importPath.endsWith('.svg') ||
                importPath.endsWith('.jpg') || importPath.endsWith('.json')) {
                // For CSS imports, check if the file exists
                if (importPath.endsWith('.css') && isRelativeImport(importPath)) {
                    const resolved = resolveRelativeImport(filePath, importPath, allFilePaths);
                    if (!resolved) {
                        errors.push({
                            type: 'missing_file',
                            message: `CSS file not found: '${importPath}'`,
                            file: filePath,
                            line,
                            suggestion: `Create the CSS file or remove the import`,
                        });
                    }
                }
                continue;
            }

            if (isRelativeImport(importPath)) {
                // Check if relative import resolves to existing file
                const resolved = resolveRelativeImport(filePath, importPath, allFilePaths);
                if (!resolved) {
                    errors.push({
                        type: 'broken_import',
                        message: `Cannot find module '${importPath}'`,
                        file: filePath,
                        line,
                        suggestion: `Check if the file exists or fix the import path`,
                    });
                }
            } else {
                // External package import
                const packageName = getPackageName(importPath);

                // Check if it's a Node.js built-in (not usable in browser)
                if (NODE_BUILT_INS.has(packageName)) {
                    errors.push({
                        type: 'missing_dependency',
                        message: `Node.js module '${packageName}' cannot be used in browser code`,
                        file: filePath,
                        line,
                        suggestion: `Use a browser-compatible alternative`,
                    });
                    continue;
                }

                // Check if package is declared in dependencies
                if (!declaredDeps.has(packageName)) {
                    // Provide specific suggestions for common packages
                    let suggestion = `Add '${packageName}' to package.json dependencies`;

                    if (packageName === 'uuid') {
                        suggestion = `Use crypto.randomUUID() instead of uuid package, or add uuid to package.json`;
                    } else if (packageName === 'lodash' || packageName === 'underscore') {
                        suggestion = `Use native JavaScript methods instead, or add ${packageName} to package.json`;
                    } else if (packageName === 'moment') {
                        suggestion = `Use native Date or Intl.DateTimeFormat instead, or add moment to package.json`;
                    } else if (packageName === 'axios') {
                        suggestion = `Use native fetch() instead, or add axios to package.json`;
                    }

                    errors.push({
                        type: 'missing_dependency',
                        message: `Package '${packageName}' is imported but not in package.json`,
                        file: filePath,
                        line,
                        suggestion,
                    });
                }
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Format build errors for sending to AI for fixing
 */
export function formatErrorsForAI(errors: BuildError[]): string {
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

/**
 * BuildValidator class for service-oriented usage
 */
export class BuildValidator {
    validate(files: Record<string, string>): BuildValidationResult {
        return validateBuild(files);
    }

    formatErrorsForAI(errors: BuildError[]): string {
        return formatErrorsForAI(errors);
    }
}

export function createBuildValidator(): BuildValidator {
    return new BuildValidator();
}
