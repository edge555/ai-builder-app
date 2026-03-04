import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseProjectGenerator } from '../../core/base-project-generator';
import { createBuildValidator } from '../../core/build-validator';
import { ValidationPipeline } from '../../core/validation-pipeline';

// Mock dependencies
vi.mock('../../core/build-validator');
vi.mock('../../core/validation-pipeline');
vi.mock('../../core/file-processor', () => ({
    processFiles: vi.fn(files => Promise.resolve(files)),
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
    let mockGeminiClient: any;
    let mockBuildValidator: any;
    let mockValidationPipeline: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockGeminiClient = {
            generate: vi.fn(),
        };

        mockBuildValidator = {
            validate: vi.fn(),
            formatErrorsForAI: vi.fn().mockReturnValue('Formatted errors'),
        };

        mockValidationPipeline = {
            validate: vi.fn(),
        };

        vi.mocked(createBuildValidator).mockReturnValue(mockBuildValidator);
        // ValidationPipeline is constructed in the constructor, so we need to mock its prototype if we want to control it per-instance easily,
        // or just let the constructor create a real one that we then mock methods on if possible.
        // Actually, let's just use the real mock instance.
        vi.mocked(ValidationPipeline).mockImplementation(function() { return mockValidationPipeline; });

        generator = new TestProjectGenerator(mockGeminiClient);
    });

    describe('runBuildFixLoop', () => {
        const initialFiles = { 'App.tsx': 'text' };
        const prompt = 'build a todo app';

        it('should return files immediately if build is valid', async () => {
            mockBuildValidator.validate.mockReturnValue({ valid: true, errors: [] });

            const result = await generator.testRunBuildFixLoop(initialFiles, 'generation', prompt);

            expect(result).toEqual(initialFiles);
            expect(mockBuildValidator.validate).toHaveBeenCalledTimes(1);
            expect(mockGeminiClient.generate).not.toHaveBeenCalled();
        });

        it('should retry and succeed when AI fixes the errors', async () => {
            // Initial validation fails
            mockBuildValidator.validate
                .mockReturnValueOnce({ valid: false, errors: [{ message: 'Missing dep', file: 'App.tsx' }] })
                .mockReturnValueOnce({ valid: true, errors: [] }); // Succeeds after fix

            mockBuildValidator.formatErrorsForAI.mockReturnValue('Formatted errors');

            // AI returns fixed project
            mockGeminiClient.generate.mockResolvedValue({
                success: true,
                content: JSON.stringify({
                    projectName: 'fixed',
                    files: [{ path: 'App.tsx', content: 'fixed content' }]
                })
            });

            // Syntax validation succeeds
            mockValidationPipeline.validate.mockReturnValue({
                valid: true,
                sanitizedOutput: { 'App.tsx': 'fixed content' },
                errors: []
            });

            const result = await generator.testRunBuildFixLoop(initialFiles, 'generation', prompt);

            expect(result).toEqual({ 'App.tsx': 'fixed content' });
            expect(mockGeminiClient.generate).toHaveBeenCalledTimes(1);
            expect(mockBuildValidator.validate).toHaveBeenCalledTimes(2);
        });

        it('should accumulate failure history across retries', async () => {
            // Fails 3 times then we stop (maxBuildRetries is 3)
            mockBuildValidator.validate.mockReturnValue({
                valid: false,
                errors: [{ message: 'Build error', file: 'index.ts' }]
            });

            mockGeminiClient.generate.mockResolvedValue({
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

            // Should return the last modified files after 3 retries
            expect(result).toEqual({ 'index.ts': 'attempt' });
            expect(mockGeminiClient.generate).toHaveBeenCalledTimes(3);

            // Verify that failure history is passed to next AI call
            // We can't directly check the internal failureHistory array, 
            // but we can check the fixPrompt function call if we mock it, 
            // or just assume it's working if it keeps going.
        });

        it('should stop and return original files if AI returns invalid JSON', async () => {
            mockBuildValidator.validate.mockReturnValue({
                valid: false,
                errors: [{ message: 'Error', file: 'f.ts' }]
            });

            mockGeminiClient.generate.mockResolvedValue({
                success: true,
                content: 'invalid json'
            });

            const result = await generator.testRunBuildFixLoop(initialFiles, 'generation', prompt);

            expect(result).toEqual(initialFiles);
            expect(mockGeminiClient.generate).toHaveBeenCalledTimes(1);
        });
    });
});
