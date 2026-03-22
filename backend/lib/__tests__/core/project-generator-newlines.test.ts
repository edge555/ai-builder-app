
import { describe, it, expect, vi } from 'vitest';
import { ProjectGenerator } from '../../core/project-generator';
import type { AIProvider } from '../../ai';

// Mock validateProjectStructure to skip structural checks
vi.mock('../../core/validators', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    validateProjectStructure: vi.fn().mockReturnValue([]),
  };
});


// Mock AIProvider
const mockGenerate = vi.fn();
const mockAIProvider: AIProvider = {
    generate: mockGenerate,
    generateStreaming: vi.fn(),
};

const mockBugfixProvider: AIProvider = {
    generate: vi.fn(),
    generateStreaming: vi.fn(),
};

const mockPromptProvider = {
    getIntentSystemPrompt: vi.fn().mockReturnValue('intent prompt'),
    getPlanningSystemPrompt: vi.fn().mockReturnValue('planning prompt'),
    getExecutionGenerationSystemPrompt: vi.fn().mockReturnValue('generation prompt'),
    getExecutionModificationSystemPrompt: vi.fn().mockReturnValue('modification prompt'),
    getReviewSystemPrompt: vi.fn().mockReturnValue('review prompt'),
    getBugfixSystemPrompt: vi.fn().mockReturnValue('bugfix prompt'),
    tokenBudgets: {
        intent: 512,
        planning: 4096,
        executionGeneration: 32768,
        executionModification: 16384,
        review: 32768,
        bugfix: 16384,
    },
};

describe('ProjectGenerator Newline Normalization', () => {
    it('should unescape literal \\n even if real newlines exist', async () => {
        const generator = new ProjectGenerator(mockAIProvider, mockBugfixProvider, mockPromptProvider);

        // Mock response with mixed newlines:
        // "import React from 'react';\n" (literal \n)
        // "export const App = () => {\n" (literal \n)
        // "  return <div>Hello</div>;\n" (literal \n)
        // "}" (real newline at end, which was causing the bug)
        const jsonContent = JSON.stringify({
            files: [
                {
                    path: 'frontend/src/types.ts',
                    content: "export interface JournalEntry {\\n  id: string;\\n  title: string;\\n  content: string;\\n  date: string;\\n}\n"
                }
            ]
        });

        mockGenerate.mockResolvedValue({
            success: true,
            content: jsonContent,
            retryCount: 0
        });

        const result = await generator.generateProject('test app');

        expect(result.success).toBe(true);
        const fileContent = result.projectState?.files['frontend/src/types.ts'];

        // Should contain real newlines for the interface properties
        expect(fileContent).toContain('interface JournalEntry {\n  id: string;');
        expect(fileContent).toContain('  id: string;\n  title: string;');

        // Should NOT contain literal \n characters (unless they are double escaped, which we don't expect here)
        // We expect the literal \n from the input string to be converted to real newlines
        const lines = fileContent?.split('\n');
        expect(lines?.length).toBeGreaterThan(2);
    });

    it('should handle content with only literal \\n', async () => {
        const generator = new ProjectGenerator(mockAIProvider, mockBugfixProvider, mockPromptProvider);

        const jsonContent = JSON.stringify({
            files: [
                {
                    path: 'frontend/src/types.ts',
                    content: "line1\\nline2\\nline3"
                }
            ]
        });

        mockGenerate.mockResolvedValue({
            success: true,
            content: jsonContent,
            retryCount: 0
        });

        const result = await generator.generateProject('test app');
        expect(result.success).toBe(true);
        const fileContent = result.projectState?.files['frontend/src/types.ts'];
        // Prettier will format this to have proper indentation and a trailing newline
        expect(fileContent).toContain('line1');
        expect(fileContent).toContain('line2');
        expect(fileContent).toContain('line3');
        expect(fileContent).toContain('\n');
    });
});
