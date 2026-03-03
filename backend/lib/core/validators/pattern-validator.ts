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
];

/**
 * Detects forbidden patterns in generated code.
 */
export function detectForbiddenPatterns(files: Record<string, string>): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const [filePath, content] of Object.entries(files)) {
        for (const { pattern, name } of FORBIDDEN_PATTERNS) {
            // Reset regex state
            pattern.lastIndex = 0;
            const match = pattern.exec(content);
            if (match) {
                // Find line number
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
