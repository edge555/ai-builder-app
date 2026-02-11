/**
 * Syntax Validator
 * Performs lightweight syntax validation on TypeScript/JavaScript code.
 */

import type { ValidationError } from '@ai-app-builder/shared';

/**
 * Validates TypeScript/JavaScript syntax using basic parsing.
 */
export function validateSyntax(files: Record<string, string>): ValidationError[] {
    const errors: ValidationError[] = [];
    const codeExtensions = ['.ts', '.tsx', '.js', '.jsx'];

    for (const [filePath, content] of Object.entries(files)) {
        const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();

        if (!codeExtensions.includes(ext)) {
            continue;
        }

        const syntaxErrors = checkBasicSyntax(content, filePath);
        errors.push(...syntaxErrors);
    }

    return errors;
}

/**
 * Performs basic syntax validation on code content.
 */
function checkBasicSyntax(content: string, filePath: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check for balanced brackets
    const bracketPairs: Record<string, string> = {
        '{': '}',
        '[': ']',
        '(': ')',
    };

    const stack: Array<{ char: string; line: number }> = [];
    let inString = false;
    let stringChar = '';
    let inTemplate = false;
    let inComment = false;
    let inBlockComment = false;
    let lineNumber = 1;

    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const prevChar = i > 0 ? content[i - 1] : '';
        const nextChar = i < content.length - 1 ? content[i + 1] : '';

        // Track line numbers
        if (char === '\n') {
            lineNumber++;
            inComment = false;
            continue;
        }

        // Handle block comments
        if (!inString && !inTemplate && char === '/' && nextChar === '*') {
            inBlockComment = true;
            continue;
        }
        if (inBlockComment && char === '*' && nextChar === '/') {
            inBlockComment = false;
            i++; // Skip the '/'
            continue;
        }
        if (inBlockComment) continue;

        // Handle line comments
        if (!inString && !inTemplate && char === '/' && nextChar === '/') {
            inComment = true;
            continue;
        }
        if (inComment) continue;

        // Handle strings
        if (!inString && !inTemplate && (char === '"' || char === "'" || char === '`')) {
            if (char === '`') {
                inTemplate = true;
            } else {
                inString = true;
                stringChar = char;
            }
            continue;
        }

        if (inString && char === stringChar && prevChar !== '\\') {
            inString = false;
            stringChar = '';
            continue;
        }

        if (inTemplate && char === '`' && prevChar !== '\\') {
            inTemplate = false;
            continue;
        }

        if (inString || inTemplate) continue;

        // Track brackets
        if (char in bracketPairs) {
            stack.push({ char, line: lineNumber });
        } else if (Object.values(bracketPairs).includes(char)) {
            const expected = Object.entries(bracketPairs).find(([, v]) => v === char)?.[0];
            if (stack.length === 0) {
                errors.push({
                    type: 'syntax_error',
                    message: `Unexpected closing bracket '${char}'`,
                    filePath,
                    line: lineNumber,
                });
            } else {
                const last = stack.pop()!;
                if (bracketPairs[last.char] !== char) {
                    errors.push({
                        type: 'syntax_error',
                        message: `Mismatched brackets: expected '${bracketPairs[last.char]}' but found '${char}'`,
                        filePath,
                        line: lineNumber,
                    });
                }
            }
        }
    }

    // Check for unclosed brackets
    for (const unclosed of stack) {
        errors.push({
            type: 'syntax_error',
            message: `Unclosed bracket '${unclosed.char}'`,
            filePath,
            line: unclosed.line,
        });
    }

    // Check for unclosed strings
    if (inString) {
        errors.push({
            type: 'syntax_error',
            message: `Unclosed string literal`,
            filePath,
            line: lineNumber,
        });
    }

    if (inTemplate) {
        errors.push({
            type: 'syntax_error',
            message: `Unclosed template literal`,
            filePath,
            line: lineNumber,
        });
    }

    return errors;
}
