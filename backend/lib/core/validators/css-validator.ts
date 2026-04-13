import type { ValidationError } from '@ai-app-builder/shared';

const CSS_EXTENSIONS = ['.css', '.scss', '.less'];
const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

function getExtension(path: string): string {
    const idx = path.lastIndexOf('.');
    return idx >= 0 ? path.slice(idx).toLowerCase() : '';
}

function getLineNumber(content: string, index: number): number {
    if (index <= 0) return 1;
    let line = 1;
    for (let i = 0; i < index && i < content.length; i++) {
        if (content[i] === '\n') line++;
    }
    return line;
}

function stripComments(content: string): string {
    return content.replace(/\/\*[\s\S]*?\*\//g, '');
}

function hasTailwindSignals(files: Record<string, string>): boolean {
    const filePaths = Object.keys(files);
    if (filePaths.some((path) => /tailwind\.config\.(js|cjs|mjs|ts)$/.test(path))) {
        return true;
    }

    for (const [path, content] of Object.entries(files)) {
        if (getExtension(path) === '.css' && /@tailwind\s+(base|components|utilities)/.test(content)) {
            return true;
        }
        if (path.endsWith('package.json')) {
            try {
                const pkg = JSON.parse(content) as {
                    dependencies?: Record<string, string>;
                    devDependencies?: Record<string, string>;
                };
                const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
                if (deps.tailwindcss || deps['@tailwindcss/postcss']) {
                    return true;
                }
            } catch {
                // Ignore malformed package.json here; handled elsewhere.
            }
        }
    }

    return false;
}

/**
 * Validate CSS syntax by checking bracket/comment/string balance.
 */
export function validateCssSyntax(files: Record<string, string>): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const [filePath, content] of Object.entries(files)) {
        if (!CSS_EXTENSIONS.includes(getExtension(filePath))) continue;

        const braceStack: number[] = [];
        let inComment = false;
        let inString: '"' | "'" | null = null;
        let escapeNext = false;

        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            const next = i + 1 < content.length ? content[i + 1] : '';

            if (inComment) {
                if (char === '*' && next === '/') {
                    inComment = false;
                    i++;
                }
                continue;
            }

            if (inString) {
                if (escapeNext) {
                    escapeNext = false;
                    continue;
                }
                if (char === '\\') {
                    escapeNext = true;
                    continue;
                }
                if (char === inString) {
                    inString = null;
                }
                continue;
            }

            if (char === '/' && next === '*') {
                inComment = true;
                i++;
                continue;
            }

            if (char === '"' || char === "'") {
                inString = char;
                continue;
            }

            if (char === '{') {
                braceStack.push(i);
            } else if (char === '}') {
                if (braceStack.length === 0) {
                    errors.push({
                        type: 'syntax_error',
                        message: 'Unexpected closing brace in CSS',
                        filePath,
                        line: getLineNumber(content, i),
                    });
                } else {
                    braceStack.pop();
                }
            }
        }

        if (inComment) {
            errors.push({
                type: 'syntax_error',
                message: 'Unclosed CSS comment',
                filePath,
                line: getLineNumber(content, content.length),
            });
        }

        if (inString) {
            errors.push({
                type: 'syntax_error',
                message: 'Unclosed CSS string literal',
                filePath,
                line: getLineNumber(content, content.length),
            });
        }

        for (const openIndex of braceStack) {
            errors.push({
                type: 'syntax_error',
                message: 'Unclosed CSS block',
                filePath,
                line: getLineNumber(content, openIndex),
            });
        }
    }

    return errors;
}

/**
 * Validate that className string literals in JSX are present in CSS selectors.
 * Returns non-blocking warnings.
 */
export function validateCssClassConsistency(files: Record<string, string>): ValidationError[] {
    if (hasTailwindSignals(files)) {
        return [];
    }

    const warnings: ValidationError[] = [];
    const definedClasses = new Set<string>();

    for (const [filePath, content] of Object.entries(files)) {
        if (!CSS_EXTENSIONS.includes(getExtension(filePath))) continue;
        const stripped = stripComments(content);
        const classRegex = /(^|[^\w-])\.([A-Za-z_][A-Za-z0-9_-]*)/g;
        let match: RegExpExecArray | null;
        while ((match = classRegex.exec(stripped)) !== null) {
            definedClasses.add(match[2]);
        }
    }

    if (definedClasses.size === 0) {
        return [];
    }

    const seen = new Set<string>();
    const cssImportRegex = /import\s+(?:[^'"]+\s+from\s+)?['"](\.{1,2}\/[^'"]+\.css)['"]/;
    const classNameRegexes = [
        /className\s*=\s*"([^"]+)"/g,
        /className\s*=\s*'([^']+)'/g,
        /className\s*=\s*\{\s*"([^"]+)"\s*\}/g,
        /className\s*=\s*\{\s*'([^']+)'\s*\}/g,
        /className\s*=\s*\{\s*`([^`$]*)`\s*\}/g,
    ];

    for (const [filePath, content] of Object.entries(files)) {
        if (!CODE_EXTENSIONS.includes(getExtension(filePath))) continue;
        if (!cssImportRegex.test(content)) continue;

        for (const regex of classNameRegexes) {
            let match: RegExpExecArray | null;
            while ((match = regex.exec(content)) !== null) {
                const classValue = match[1];
                const tokens = classValue.split(/\s+/).filter(Boolean);

                for (const token of tokens) {
                    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(token)) continue;
                    if (definedClasses.has(token)) continue;

                    const dedupeKey = `${filePath}:${token}`;
                    if (seen.has(dedupeKey)) continue;
                    seen.add(dedupeKey);

                    warnings.push({
                        type: 'styling_warning',
                        message: `className "${token}" was not found in CSS selectors`,
                        filePath,
                        line: getLineNumber(content, match.index),
                    });
                }
            }
        }
    }

    return warnings;
}
