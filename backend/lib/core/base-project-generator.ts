/**
 * Base Project Generator
 * Contains shared functionality between ProjectGenerator and StreamingProjectGenerator.
 */

import type { FileDiff } from '@ai-app-builder/shared';
import { GeminiClient, createGeminiClient } from '../ai';
import { ValidationPipeline } from './validation-pipeline';
import { BuildValidator, createBuildValidator } from './build-validator';

/**
 * Abstract base class for project generators.
 * Contains shared logic for both streaming and non-streaming generation.
 */
export abstract class BaseProjectGenerator {
    protected readonly geminiClient: GeminiClient;
    protected readonly validationPipeline: ValidationPipeline;
    protected readonly buildValidator: BuildValidator;
    protected readonly maxBuildRetries = 2;

    constructor(geminiClient?: GeminiClient) {
        this.geminiClient = geminiClient ?? createGeminiClient();
        this.validationPipeline = new ValidationPipeline();
        this.buildValidator = createBuildValidator();
    }

    /**
     * Extracts a project name from the description.
     */
    protected extractProjectName(description: string): string {
        // Take first few words, clean up, and use as name
        const words = description
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 0)
            .slice(0, 3);

        if (words.length === 0) {
            return 'new-project';
        }

        return words.join('-').toLowerCase();
    }

    /**
     * Computes initial diffs for a new project (all files are "added").
     */
    protected computeInitialDiffs(files: Record<string, string>): FileDiff[] {
        return Object.entries(files).map(([filePath, content]) => {
            const lines = content.split('\n');
            return {
                filePath,
                status: 'added' as const,
                hunks: [{
                    oldStart: 0,
                    oldLines: 0,
                    newStart: 1,
                    newLines: lines.length,
                    changes: lines.map((line, index) => ({
                        type: 'add' as const,
                        lineNumber: index + 1,
                        content: line,
                    })),
                }],
            };
        });
    }
}
