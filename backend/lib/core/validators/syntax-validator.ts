/**
 * Syntax Validator
 * Performs syntax validation on TypeScript/JavaScript code using AST parsing.
 */

import { parse } from '@babel/parser';
import type { ValidationError } from '@ai-app-builder/shared';

/**
 * Validates TypeScript/JavaScript syntax using Babel parser.
 */
export function validateSyntax(files: Record<string, string>): ValidationError[] {
    const errors: ValidationError[] = [];
    const codeExtensions = ['.ts', '.tsx', '.js', '.jsx'];

    for (const [filePath, content] of Object.entries(files)) {
        const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();

        if (!codeExtensions.includes(ext)) {
            continue;
        }

        const plugins = getParserPlugins(ext);

        try {
            parse(content, {
                sourceType: 'module',
                plugins,
                errorRecovery: false,
            });
        } catch (error) {
            const parserError = error as {
                message?: string;
                loc?: { line?: number };
            };

            errors.push({
                type: 'syntax_error',
                message: parserError.message ?? 'Syntax parse error',
                filePath,
                line: parserError.loc?.line ?? 1,
            });
        }
    }

    return errors;
}

/**
 * Choose parser plugins based on file extension.
 */
function getParserPlugins(ext: string): Array<'jsx' | 'typescript'> {
    switch (ext) {
        case '.tsx':
            return ['typescript', 'jsx'];
        case '.ts':
            return ['typescript'];
        case '.jsx':
        case '.js':
            return ['jsx'];
        default:
            return [];
    }
}
