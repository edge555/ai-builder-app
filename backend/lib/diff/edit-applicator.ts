/**
 * Edit Applicator Module
 * 
 * Handles applying search/replace edits to file content and content normalization.
 * Extracted from ModificationEngine for better separation of concerns.
 */

import type { EditOperation, EditApplicationResult } from '@ai-app-builder/shared';
import { applySearchReplace } from './multi-tier-matcher';
import { createLogger } from '../logger';

const logger = createLogger('EditApplicator');

/**
 * Apply search/replace edits to file content.
 * Returns the modified content or an error if edits cannot be applied.
 */
export function applyEdits(
    originalContent: string,
    edits: EditOperation[]
): EditApplicationResult {
    let content = originalContent;
    const warnings: string[] = [];

    for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];

        // Normalize escape sequences in search and replace strings
        // Note: With structured output, this should be less necessary, but keep for safety
        let search = edit.search;
        let replace = edit.replace;

        // Handle escaped newlines and tabs from JSON
        if (search.includes('\\n')) search = search.replace(/\\n/g, '\n');
        if (search.includes('\\t')) search = search.replace(/\\t/g, '\t');
        if (replace.includes('\\n')) replace = replace.replace(/\\n/g, '\n');
        if (replace.includes('\\t')) replace = replace.replace(/\\t/g, '\t');

        // Use multi-tier matcher for robust search/replace
        const occurrence = edit.occurrence ?? 1;
        const result = applySearchReplace(content, search, replace, occurrence);

        if (!result.success) {
            logger.error('Edit application failed', {
                editIndex: i,
                error: result.error,
                searchPreview: search.substring(0, 100),
            });
            return {
                success: false,
                error: result.error ?? 'Unknown error applying edit',
                failedEditIndex: i,
            };
        }

        content = result.content!;

        // Log warnings from fuzzy matching
        if (result.warning) {
            logger.warn('Edit applied with warning', {
                editIndex: i,
                warning: result.warning,
            });
            warnings.push(`Edit ${i + 1}: ${result.warning}`);
        }
    }

    return {
        success: true,
        content,
        warnings: warnings.length > 0 ? warnings : undefined,
    };
}

/**
 * Normalize file content for comparison.
 * Removes trailing whitespace from each line and ensures consistent line endings.
 */
export function normalizeContent(content: string): string {
    return content
        .split('\n')
        .map(line => line.trimEnd())
        .join('\n')
        .trimEnd();
}
