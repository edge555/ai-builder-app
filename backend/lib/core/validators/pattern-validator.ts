/**
 * Pattern Validator
 * Detects forbidden or undesirable patterns in generated code.
 */

import type { ValidationError } from '@ai-app-builder/shared';

// Forbidden patterns in generated code
const FORBIDDEN_PATTERNS = [
    { pattern: /```[\s\S]*?```/g, name: 'markdown code blocks' },
    { pattern: /^\s*```\w*\s*$/gm, name: 'markdown code fence' },
    { pattern: /\/\/\s*TODO\b/gi, name: 'TODO comments' },
    { pattern: /\/\*\s*TODO\b/gi, name: 'TODO block comments' },
    { pattern: /{\s*\/\*\s*TODO\b/gi, name: 'TODO JSX comments' },

    // Partial-generation stubs — AI leaving placeholder content instead of real code
    { pattern: /\/\/\s*\.\.\.\s*(rest|remaining|previous|existing|unchanged|omitted|implementation|code|content|etc\.?)\b/gi, name: 'partial-generation stub' },
    { pattern: /\/\/\s*\.\.\.\s*$/gm, name: 'trailing ellipsis stub' },
    { pattern: /\/\*[\s\S]*?\.\.\.\s*(rest|remaining|previous|existing|unchanged|omitted|implementation|code|content)[\s\S]*?\*\//gi, name: 'partial-generation block stub' },
    { pattern: /\{\/\*\s*\.\.\.\s*\*\/\}/g, name: 'JSX ellipsis stub' },
    { pattern: /\/\/\s*\.\.\.\s*(add|insert|put|write|place|include)\b/gi, name: 'instruction stub' },

    // Suppression directives — AI papering over errors it cannot fix
    { pattern: /\/\/\s*@ts-nocheck\b/gi, name: '@ts-nocheck directive' },
    { pattern: /\/\/\s*eslint-disable\s*$/gm, name: 'blanket eslint-disable' },
];

/**
 * Detects forbidden patterns in generated code.
 */
export function detectForbiddenPatterns(files: Record<string, string>): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const [filePath, content] of Object.entries(files)) {
        for (const { pattern, name } of FORBIDDEN_PATTERNS) {
            // Reset regex state and report ALL occurrences
            pattern.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = pattern.exec(content)) !== null) {
                const beforeMatch = content.slice(0, match.index);
                const lineNumber = (beforeMatch.match(/\n/g) || []).length + 1;

                errors.push({
                    type: 'forbidden_pattern',
                    message: `Forbidden pattern detected: ${name}`,
                    filePath,
                    line: lineNumber,
                });
            }
        }
    }

    return errors;
}
