/**
 * Prompt Builder Module
 * 
 * Builds modification prompts with relevant code context.
 * Extracted from ModificationEngine for better separation of concerns.
 */

import type { ProjectState } from '@ai-app-builder/shared';
import type { CodeSlice } from '../analysis/file-planner/types';

/**
 * Build the modification prompt with relevant code slices.
 */
export function buildModificationPrompt(
    userPrompt: string,
    slices: CodeSlice[],
    _projectState: ProjectState
): string {
    const primarySlices = slices.filter(s => s.relevance === 'primary');
    const contextSlices = slices.filter(s => s.relevance === 'context');

    let prompt = `User Request: ${userPrompt}\n\n`;

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
