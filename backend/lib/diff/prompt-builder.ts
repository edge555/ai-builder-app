/**
 * Prompt Builder Module
 * 
 * Builds modification prompts with relevant code context.
 * Extracted from ModificationEngine for better separation of concerns.
 */

import type { ProjectState, EditDetail, ConversationTurn } from '@ai-app-builder/shared';
import type { CodeSlice } from '../analysis/file-planner/types';
import type { FailedFileEdit } from './file-edit-applicator';
import { findClosestRegion } from './multi-tier-matcher';

/**
 * Build the modification prompt with relevant code slices.
 */
export function buildModificationPrompt(
    userPrompt: string,
    slices: CodeSlice[],
    _projectState: ProjectState,
    conversationHistory?: ConversationTurn[]
): string {
    const primarySlices = slices.filter(s => s.relevance === 'primary');
    const contextSlices = slices.filter(s => s.relevance === 'context');

    let prompt = '';

    // Insert conversation context before the user request if available
    const conversationContext = formatConversationContext(conversationHistory);
    if (conversationContext) {
        prompt += conversationContext;
    }

    prompt += `User Request: ${userPrompt}\n\n`;

    if (primarySlices.length > 0) {
        prompt += `=== PRIMARY FILES (likely need modification) ===\n\n`;
        for (const slice of primarySlices) {
            prompt += `--- ${slice.filePath} ---\n`;
            prompt += `${slice.content}\n\n`;
        }
    }

    if (contextSlices.length > 0) {
        prompt += `=== CONTEXT FILES (for reference) ===\n\n`;
        for (const slice of contextSlices) {
            prompt += `--- ${slice.filePath} ---\n`;
            prompt += `${slice.content}\n\n`;
        }
    }

    prompt += `Based on the user request, output ONLY the JSON with modified/new files.`;

    return prompt;
}

/**
 * Build a focused prompt for build-fix retries using current (post-edit) file contents.
 * Includes error files, their dependents (files that import them), and package.json,
 * so the AI sees the actual state it needs to fix — not stale pre-edit slices.
 */
export function buildBuildFixPrompt(
    userPrompt: string,
    errorFiles: Set<string>,
    allFiles: Record<string, string>
): string {
    // Always include package.json if it exists (dependency fixes are common)
    const filesToInclude = new Set(errorFiles);
    if (allFiles['package.json']) {
        filesToInclude.add('package.json');
    }

    // Include dependents — files that import any error file
    const dependents = findDependents(errorFiles, allFiles);
    for (const dep of dependents) {
        filesToInclude.add(dep);
    }

    let prompt = `User Request: ${userPrompt}\n\n`;

    if (errorFiles.size > 0) {
        prompt += `=== FILES WITH BUILD ERRORS (current content) ===\n\n`;
    }

    for (const filePath of errorFiles) {
        const content = allFiles[filePath];
        if (content !== undefined) {
            prompt += `--- ${filePath} ---\n`;
            prompt += `${content}\n\n`;
        }
    }

    if (dependents.size > 0) {
        prompt += `=== DEPENDENT FILES (import error files — may need updates) ===\n\n`;
        for (const filePath of dependents) {
            const content = allFiles[filePath];
            if (content !== undefined) {
                prompt += `--- ${filePath} ---\n`;
                prompt += `${content}\n\n`;
            }
        }
    }

    // Include package.json separately if it's not already in error or dependent files
    if (allFiles['package.json'] && !errorFiles.has('package.json') && !dependents.has('package.json')) {
        prompt += `=== PACKAGE.JSON ===\n\n`;
        prompt += `--- package.json ---\n`;
        prompt += `${allFiles['package.json']}\n\n`;
    }

    prompt += `Based on the user request, output ONLY the JSON with modified/new files.`;

    return prompt;
}

/** Import pattern to extract module specifiers from source files. */
const IMPORT_RE = /(?:import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;

/** Source file extensions we scan for imports. */
const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx'];

/** Extensions to try when resolving a bare relative import. */
const RESOLVE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.css'];

/**
 * Find files in `allFiles` that contain a relative import resolving to any file in `targets`.
 * Returns a set of dependent file paths (excluding the targets themselves).
 */
function findDependents(targets: Set<string>, allFiles: Record<string, string>): Set<string> {
    if (targets.size === 0) return new Set();

    // Build a normalized lookup of target paths for fast matching
    const normalizedTargets = new Set<string>();
    for (const t of targets) {
        normalizedTargets.add(normalizePath(t));
        // Also add without extension so bare imports match
        const dotIdx = t.lastIndexOf('.');
        if (dotIdx > t.lastIndexOf('/')) {
            normalizedTargets.add(normalizePath(t.substring(0, dotIdx)));
        }
    }

    const dependents = new Set<string>();

    for (const [filePath, content] of Object.entries(allFiles)) {
        if (targets.has(filePath)) continue;
        const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
        if (!SOURCE_EXTS.includes(ext)) continue;

        const dir = filePath.substring(0, filePath.lastIndexOf('/'));

        // Scan for imports
        IMPORT_RE.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = IMPORT_RE.exec(content)) !== null) {
            const mod = match[1] || match[2];
            if (!mod || (!mod.startsWith('./') && !mod.startsWith('../'))) continue;

            const resolved = normalizePath(resolveRelative(dir, mod));

            if (normalizedTargets.has(resolved)) {
                dependents.add(filePath);
                break;
            }
            // Try with extensions
            for (const resolveExt of RESOLVE_EXTS) {
                if (normalizedTargets.has(resolved + resolveExt)) {
                    dependents.add(filePath);
                    break;
                }
            }
            if (dependents.has(filePath)) break;
            // Try index files
            for (const resolveExt of RESOLVE_EXTS) {
                if (normalizedTargets.has(resolved + '/index' + resolveExt)) {
                    dependents.add(filePath);
                    break;
                }
            }
            if (dependents.has(filePath)) break;
        }
    }

    return dependents;
}

/** Normalize path separators and case for comparison. */
function normalizePath(p: string): string {
    return p.replace(/\\/g, '/').toLowerCase();
}

/** Resolve a relative import path against a directory. */
function resolveRelative(dir: string, importPath: string): string {
    if (importPath.startsWith('./')) {
        return `${dir}/${importPath.slice(2)}`;
    }
    // ../
    const parts = dir.split('/');
    let remaining = importPath;
    while (remaining.startsWith('../')) {
        parts.pop();
        remaining = remaining.slice(3);
    }
    return `${parts.join('/')}/${remaining}`;
}

/**
 * Build a focused retry prompt for failed edits (search/replace).
 * Shows the current file content + failed edit details + closest-region hints.
 */
export function buildFailedEditRetryPrompt(
    userPrompt: string,
    failedFileEdits: FailedFileEdit[],
): string {
    let prompt = `User Request: ${userPrompt}\n\n`;
    prompt += `[RETRY - SEARCH/REPLACE FAILED]\nSome edits failed to match. Below is the CURRENT content of each failed file and the edits that failed.\nMatch your search strings against the CURRENT content shown below (not the original).\n\n`;

    for (const failed of failedFileEdits) {
        const currentContent = failed.partialContent ?? failed.originalContent;
        prompt += `=== FILE: ${failed.path} (current content) ===\n`;
        prompt += `${currentContent}\n\n`;
        prompt += `--- Failed edits for ${failed.path} ---\n`;
        for (const detail of failed.failedEdits) {
            prompt += `Edit #${detail.editIndex + 1}: ${detail.error}\n`;
            // Add closest-region hint
            const closest = findClosestRegion(currentContent, detail.edit.search);
            if (closest) {
                prompt += `Closest region (lines ${closest.startLine}-${closest.endLine}, ${Math.round(closest.similarity * 100)}% similar):\n${closest.regionText}\n`;
            }
            prompt += `\n`;
        }
    }

    prompt += `Fix ONLY the failed files above. Use "modify" with corrected search strings, or "replace_file" with complete corrected content.\n`;
    prompt += `Output ONLY the JSON with modified files.`;

    return prompt;
}

/**
 * Build a retry prompt requesting replace_file for remaining failures.
 * Most reliable fallback — asks AI for complete corrected file content.
 */
export function buildReplaceFileRetryPrompt(
    userPrompt: string,
    failedFileEdits: FailedFileEdit[],
): string {
    let prompt = `User Request: ${userPrompt}\n\n`;
    prompt += `[RETRY - USE replace_file]\nPrevious search/replace attempts failed for the files below. Provide the COMPLETE corrected file content using "replace_file" operation.\n\n`;

    for (const failed of failedFileEdits) {
        const currentContent = failed.partialContent ?? failed.originalContent;
        prompt += `=== FILE: ${failed.path} (current content) ===\n`;
        prompt += `${currentContent}\n\n`;
        prompt += `Apply these changes that could not be matched:\n`;
        for (const detail of failed.failedEdits) {
            prompt += `- Replace region similar to: ${detail.edit.search.substring(0, 100)}...\n  With: ${detail.edit.replace.substring(0, 100)}...\n`;
        }
        prompt += `\n`;
    }

    prompt += `For each file above, use "replace_file" operation with the COMPLETE corrected file content.\n`;
    prompt += `Output ONLY the JSON with the files.`;

    return prompt;
}

/**
 * Format conversation history into a prompt section.
 * Returns null if no meaningful history is provided.
 */
export function formatConversationContext(history?: ConversationTurn[]): string | null {
    if (!history || history.length === 0) return null;

    let section = `=== CONVERSATION HISTORY (recent turns) ===\n\n`;

    for (const turn of history) {
        if (turn.role === 'user') {
            section += `User: ${turn.content}\n`;
        } else {
            const files = turn.changeSummary?.affectedFiles;
            const desc = turn.changeSummary?.description;
            if (desc || (files && files.length > 0)) {
                const fileList = files && files.length > 0 ? ` [files: ${files.join(', ')}]` : '';
                section += `Assistant: ${desc ?? turn.content}${fileList}\n`;
            } else {
                section += `Assistant: ${turn.content}\n`;
            }
        }
        section += '\n';
    }

    return section;
}

/**
 * Build code slices directly from project files without using FilePlanner.
 * All files are treated as primary files (full content included).
 * Used when shouldSkipPlanning option is true.
 */
export function buildSlicesFromFiles(projectState: ProjectState): CodeSlice[] {
    const slices: CodeSlice[] = [];

    for (const [filePath, content] of Object.entries(projectState.files)) {
        slices.push({
            filePath,
            content,
            relevance: 'primary',
        });
    }

    return slices;
}
