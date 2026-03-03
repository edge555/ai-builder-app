/**
 * Path Validator
 * Validates file paths for security and correctness.
 */

import type { ValidationError } from '@ai-app-builder/shared';

// Valid file extensions for generated projects
const VALID_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.scss', '.html', '.md', '.txt',
    '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp',
    '.yaml', '.yml', '.env', '.gitignore', '.eslintrc', '.prettierrc',
]);

// Path traversal patterns
const PATH_TRAVERSAL_PATTERNS = [
    /\.\.\//,
    /\.\.\\/,
    /^\//, // absolute paths
    /^[A-Za-z]:/, // Windows absolute paths
];

// Invalid path characters
const INVALID_PATH_CHARS = /[<>:"|?*\x00-\x1f]/;

/**
 * Validates file paths for security and correctness.
 */
export function validateFilePaths(files: Record<string, string>): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const filePath of Object.keys(files)) {
        // Check for path traversal
        for (const pattern of PATH_TRAVERSAL_PATTERNS) {
            if (pattern.test(filePath)) {
                errors.push({
                    type: 'invalid_path',
                    message: `Path traversal or absolute path detected: "${filePath}"`,
                    filePath,
                });
                break;
            }
        }

        // Check for invalid characters
        if (INVALID_PATH_CHARS.test(filePath)) {
            errors.push({
                type: 'invalid_path',
                message: `Invalid characters in path: "${filePath}"`,
                filePath,
            });
        }

        // Check for empty path
        if (!filePath || filePath.trim() === '') {
            errors.push({
                type: 'invalid_path',
                message: 'Empty file path',
                filePath,
            });
            continue;
        }

        // Check file extension
        const lastDotIndex = filePath.lastIndexOf('.');
        if (lastDotIndex > 0) {
            const ext = filePath.slice(lastDotIndex).toLowerCase();
            // Only validate extension if there is one (allow extensionless files like .gitignore)
            if (ext && !VALID_EXTENSIONS.has(ext) && !filePath.startsWith('.')) {
                errors.push({
                    type: 'invalid_path',
                    message: `Invalid file extension "${ext}" in path: "${filePath}"`,
                    filePath,
                });
            }
        }
    }

    return errors;
}
