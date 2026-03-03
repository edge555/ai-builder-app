/**
 * JSON Validator
 * Validates JSON structure and handles AI output parsing/sanitization.
 */

import type { ValidationError } from '@ai-app-builder/shared';
import { createLogger } from '../../logger';

const logger = createLogger('json-validator');

/**
 * Validates that the input is valid JSON with string keys and string values.
 */
export function validateJsonStructure(input: unknown): ValidationError[] {
    const errors: ValidationError[] = [];

    if (input === null || input === undefined) {
        errors.push({
            type: 'invalid_json',
            message: 'Input is null or undefined',
        });
        return errors;
    }

    if (typeof input !== 'object' || Array.isArray(input)) {
        errors.push({
            type: 'invalid_json',
            message: 'Input must be a JSON object with file paths as keys',
        });
        return errors;
    }

    const obj = input as Record<string, unknown>;

    for (const [key, value] of Object.entries(obj)) {
        if (typeof key !== 'string') {
            errors.push({
                type: 'invalid_json',
                message: `Key must be a string, got ${typeof key}`,
                filePath: String(key),
            });
        }

        if (typeof value !== 'string') {
            errors.push({
                type: 'invalid_json',
                message: `Value for "${key}" must be a string, got ${typeof value}`,
                filePath: key,
            });
        }
    }

    return errors;
}

/**
 * Sanitizes a JSON string by fixing common issues from AI output.
 */
function sanitizeJsonString(input: string): string {
    let result = input;
    result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    let sanitized = '';
    let inString = false;
    let stringChar = '';
    let i = 0;

    while (i < result.length) {
        const char = result[i];
        const prevChar = i > 0 ? result[i - 1] : '';

        if (!inString && (char === '"' || char === "'")) {
            inString = true;
            stringChar = char;
            sanitized += char;
            i++;
            continue;
        }

        if (inString && char === stringChar && prevChar !== '\\') {
            inString = false;
            stringChar = '';
            sanitized += char;
            i++;
            continue;
        }

        if (inString) {
            const code = char.charCodeAt(0);
            if (code < 32) {
                if (char === '\n') sanitized += '\\n';
                else if (char === '\r') sanitized += '\\r';
                else if (char === '\t') sanitized += '\\t';
                else sanitized += '\\u' + code.toString(16).padStart(4, '0');
            } else {
                sanitized += char;
            }
        } else {
            sanitized += char;
        }
        i++;
    }

    return sanitized;
}

/**
 * Parses AI output that may contain JSON wrapped in markdown or other text.
 */
export function parseAIOutput(rawOutput: string): { success: boolean; data?: Record<string, string>; error?: string } {
    if (!rawOutput || rawOutput.trim() === '') {
        return { success: false, error: 'Empty AI output' };
    }

    const tryParse = (jsonStr: string): Record<string, string> | null => {
        try {
            const parsed = JSON.parse(jsonStr);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                return parsed;
            }
        } catch { }

        try {
            const sanitized = sanitizeJsonString(jsonStr);
            const parsed = JSON.parse(sanitized);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                return parsed;
            }
        } catch (e) {
            logger.error('Parse failed even after sanitization:', { error: e });
        }

        return null;
    };

    const directParse = tryParse(rawOutput);
    if (directParse) return { success: true, data: directParse };

    const jsonBlockMatch = rawOutput.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonBlockMatch) {
        const blockParse = tryParse(jsonBlockMatch[1].trim());
        if (blockParse) return { success: true, data: blockParse };
    }

    const firstBrace = rawOutput.indexOf('{');
    const lastBrace = rawOutput.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonCandidate = rawOutput.slice(firstBrace, lastBrace + 1);
        const extractedParse = tryParse(jsonCandidate);
        if (extractedParse) return { success: true, data: extractedParse };
    }

    return { success: false, error: 'Failed to parse AI output as JSON' };
}
