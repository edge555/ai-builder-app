/**
 * Edit Applicator Module
 * 
 * Handles applying search/replace edits to file content and content normalization.
 * Extracted from ModificationEngine for better separation of concerns.
 */

import type { EditOperation, EditApplicationResult, EditDetail } from '@ai-app-builder/shared';
import { applySearchReplace } from './multi-tier-matcher';
import { createLogger } from '../logger';

const logger = createLogger('EditApplicator');

/**
 * Apply search/replace edits to file content.
 * Processes ALL edits (continue-on-failure), tracking partial content from successful edits.
 * Returns success: false if any edit fails, but includes partialContent and editDetails.
 */
export function applyEdits(
    originalContent: string,
    edits: EditOperation[]
): EditApplicationResult {
    let content = originalContent;
    let partialContent = originalContent;
    const warnings: string[] = [];
    const editDetails: EditDetail[] = [];
    let hasFailure = false;
    let firstFailedIndex: number | undefined;
    let firstError: string | undefined;

    for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];

        // Normalize escape sequences in search and replace strings
        let search = edit.search;
        let replace = edit.replace;

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
            editDetails.push({
                editIndex: i,
                success: false,
                matchTier: result.tier ?? 0,
                error: result.error ?? 'Unknown error applying edit',
                edit,
            });
            if (!hasFailure) {
                hasFailure = true;
                firstFailedIndex = i;
                firstError = result.error ?? 'Unknown error applying edit';
            }
            continue;
        }

        content = result.content!;
        partialContent = result.content!;

        editDetails.push({
            editIndex: i,
            success: true,
            matchTier: result.tier,
            warning: result.warning,
            edit,
        });

        if (result.warning) {
            logger.warn('Edit applied with warning', {
                editIndex: i,
                warning: result.warning,
            });
            warnings.push(`Edit ${i + 1}: ${result.warning}`);
        }
    }

    if (hasFailure) {
        return {
            success: false,
            content,
            error: firstError,
            failedEditIndex: firstFailedIndex,
            warnings: warnings.length > 0 ? warnings : undefined,
            editDetails,
            partialContent,
        };
    }

    return {
        success: true,
        content,
        warnings: warnings.length > 0 ? warnings : undefined,
        editDetails,
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
