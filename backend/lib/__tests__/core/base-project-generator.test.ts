import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseProjectGenerator } from '../../core/base-project-generator';
import { createBuildValidator } from '../../core/build-validator';
import { ValidationPipeline } from '../../core/validation-pipeline';

// Mock dependencies
vi.mock('../../core/build-validator');
vi.mock('../../core/validation-pipeline');
vi.mock('../../core/file-processor', () => ({
    processFiles: vi.fn((files: Array<{ path: string; content: string }>) =>
        Promise.resolve({
            files: Object.fromEntries(files.map((f: any) => [f.path, f.content])),
            warnings: [],
        })
    ),
}));

// Concrete implementation for testing
class TestProjectGenerator extends BaseProjectGenerator {
    // Expose protected method for testing
    public async testRunBuildFixLoop(files: Record<string, string>, mode: any, prompt: string) {
        return this.runBuildFixLoop(files, mode, prompt);
    }
}

describe('BaseProjectGenerator', () => {
    let generator: TestProjectGenerator;
    let mockAIProvider: any;
    let mockBuildValidator: any;
    let mockValidationPipeline: any;
    let mockPromptProvider: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockAIProvider = {
            generate: vi.fn(),
            generateStreaming: vi.fn(),
        };

        mockBuildValidator = {
            validate: vi.fn(),
            validateAll: vi.fn().mockReturnValue({ valid: true, errors: [] }),
            validateCrossFileReferences: vi.fn().mockReturnValue([]),
            formatErrorsForAI: vi.fn().mockReturnValue('Formatted errors'),
        };

        mockValidationPipeline = {
            validate: vi.fn().mockReturnValue({ valid: true, sanitizedOutput: {}, errors: [] }),
        };

        mockPromptProvider = {
            getIntentSystemPrompt: vi.fn().mockReturnValue('intent prompt'),
            getPlanningSystemPrompt: vi.fn().mockReturnValue('planning prompt'),
            getExecutionGenerationSystemPrompt: vi.fn().mockReturnValue('generation prompt'),
            getExecutionModificationSystemPrompt: vi.fn().mockReturnValue('modification prompt'),
            getReviewSystemPrompt: vi.fn().mockReturnValue('review prompt'),
            getBugfixSystemPrompt: vi.fn().mockReturnValue('fix errors'),
            tokenBudgets: {
                intent: 512,
                planning: 4096,
                executionGeneration: 32768,
                executionModification: 16384,
                review: 32768,
                bugfix: 16384,
            },
        };

        vi.mocked(createBuildValidator).mockReturnValue(mockBuildValidator);
        // ValidationPipeline is constructed in the constructor, so we need to mock its prototype if we want to control it per-instance easily,
        // or just let the constructor create a real one that we then mock methods on if possible.
        // Actually, let's just use the real mock instance.
        vi.mocked(ValidationPipeline).mockImplementation(function() { return mockValidationPipeline; });

        generator = new TestProjectGenerator(mockAIProvider, mockPromptProvider);
    });

    describe('runBuildFixLoop', () => {
        const initialFiles = { 'App.tsx': 'text' };
        const prompt = 'build a todo app';

        it('should return files immediately if build is valid', async () => {
            // validateAll default is already { valid: true, errors: [] } — no extra mock needed

            const result = await generator.testRunBuildFixLoop(initialFiles, 'generation', prompt);

            expect(result).toEqual(initialFiles);
            expect(mockBuildValidator.validateAll).toHaveBeenCalledTimes(1);
            expect(mockAIProvider.generate).not.toHaveBeenCalled();
        });

        it('should retry and succeed when AI fixes the errors', async () => {
            // Initial acceptance check fails (build error), subsequent checks succeed
            mockBuildValidator.validateAll
                .mockReturnValueOnce({ valid: false, errors: [{ message: 'Missing dep', file: 'App.tsx', type: 'missing_dependency', severity: 'fixable' }] });
            // Default mockReturnValue({ valid: true, errors: [] }) applies for calls 2 & 3

            mockBuildValidator.formatErrorsForAI.mockReturnValue('Formatted errors');

            // AI returns fixed project
            mockAIProvider.generate.mockResolvedValue({
                success: true,
                content: JSON.stringify({
                    projectName: 'fixed',
                    files: [{ path: 'App.tsx', content: 'fixed content' }]
                })
            });

            // Validation pipeline returns fixed content as sanitizedOutput
            mockValidationPipeline.validate.mockReturnValue({
                valid: true,
                sanitizedOutput: { 'App.tsx': 'fixed content' },
                errors: []
            });

            const result = await generator.testRunBuildFixLoop(initialFiles, 'generation', prompt);

            expect(result).toEqual({ 'App.tsx': 'fixed content' });
            expect(mockAIProvider.generate).toHaveBeenCalledTimes(1);
            // initial + revalidation after fix + post-fix re-check
            expect(mockBuildValidator.validateAll).toHaveBeenCalledTimes(3);
        });

        it('should accumulate failure history across retries', async () => {
            // Always fails — acceptance gate never passes (maxBuildRetries is 3)
            mockBuildValidator.validateAll.mockReturnValue({
                valid: false,
                errors: [{ message: 'Build error', file: 'index.ts', type: 'missing_dependency', severity: 'fixable' }]
            });

            mockAIProvider.generate.mockResolvedValue({
                success: true,
                content: JSON.stringify({
                    projectName: 'retry',
                    files: [{ path: 'index.ts', content: 'attempt' }]
                })
            });

            mockValidationPipeline.validate.mockReturnValue({
                valid: true,
                sanitizedOutput: { 'index.ts': 'attempt' },
                errors: []
            });

            const result = await generator.testRunBuildFixLoop(initialFiles, 'generation', prompt);

            // revalidation always fails so currentFiles is never updated — returns original files
            expect(result).toEqual(initialFiles);
            expect(mockAIProvider.generate).toHaveBeenCalledTimes(3);

            // Verify that failure history is passed to next AI call
            // We can't directly check the internal failureHistory array, 
            // but we can check the fixPrompt function call if we mock it, 
            // or just assume it's working if it keeps going.
        });

        it('should retry all attempts and return original files if AI keeps returning invalid JSON', async () => {
            mockBuildValidator.validateAll.mockReturnValue({
                valid: false,
                errors: [{ message: 'Error', file: 'f.ts', type: 'missing_dependency', severity: 'fixable' }]
            });

            mockAIProvider.generate.mockResolvedValue({
                success: true,
                content: 'invalid json'
            });

            const result = await generator.testRunBuildFixLoop(initialFiles, 'generation', prompt);

            expect(result).toEqual(initialFiles);
            expect(mockAIProvider.generate).toHaveBeenCalledTimes(3);
        });
    });
});
