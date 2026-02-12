import { describe, expect, it, vi, beforeEach } from 'vitest';
import { StreamingProjectGenerator } from '../streaming-generator';
import { GeminiClient } from '../../ai';
import { ValidationPipeline } from '../validation-pipeline';
import * as buildValidatorModule from '../build-validator';

vi.mock('../../ai');
vi.mock('../validation-pipeline');
vi.mock('../build-validator');

describe('StreamingProjectGenerator', () => {
    let generator: StreamingProjectGenerator;
    let mockGeminiClient: any;
    let mockValidationPipeline: any;
    let mockBuildValidator: any;

    beforeEach(() => {
        mockGeminiClient = {
            generateStreaming: vi.fn(),
            generate: vi.fn(),
        };
        mockValidationPipeline = {
            validate: vi.fn(),
        };
        mockBuildValidator = {
            validate: vi.fn(),
            formatErrorsForAI: vi.fn(),
        };

        (GeminiClient as any).mockImplementation(() => mockGeminiClient);
        (ValidationPipeline as any).mockImplementation(() => mockValidationPipeline);

        // Mock both class and factory function
        (buildValidatorModule.BuildValidator as any).mockImplementation(() => mockBuildValidator);
        (buildValidatorModule.createBuildValidator as any).mockReturnValue(mockBuildValidator);

        generator = new StreamingProjectGenerator(mockGeminiClient);
    });

    it('should generate a project with streaming emission', async () => {
        const mockContent = JSON.stringify({
            files: [
                { path: 'src/App.tsx', content: 'export default App;' },
                { path: 'package.json', content: '{}' },
            ],
        });

        mockGeminiClient.generateStreaming.mockImplementation(async ({ onChunk }: any) => {
            onChunk(mockContent, mockContent.length);
            return { success: true, content: mockContent };
        });

        mockValidationPipeline.validate.mockReturnValue({
            valid: true,
            sanitizedOutput: {
                'src/App.tsx': 'export default App;',
                'package.json': '{}',
            },
        });

        mockBuildValidator.validate.mockReturnValue({ valid: true, errors: [] });

        const callbacks = {
            onStart: vi.fn(),
            onFile: vi.fn(),
            onComplete: vi.fn(),
        };

        const result = await generator.generateProjectStreaming('A test project', callbacks);

        expect(result.success).toBe(true);
        expect(callbacks.onStart).toHaveBeenCalled();
        expect(callbacks.onFile).toHaveBeenCalled();
        expect(callbacks.onComplete).toHaveBeenCalled();
        expect(result.projectState).toBeDefined();
        expect(result.version).toBeDefined();
    });

    it('should handle AI errors during streaming', async () => {
        mockGeminiClient.generateStreaming.mockResolvedValue({
            success: false,
            error: 'AI Error',
        });

        const callbacks = {
            onError: vi.fn(),
        };

        const result = await generator.generateProjectStreaming('test', callbacks);

        expect(result.success).toBe(false);
        expect(callbacks.onError).toHaveBeenCalledWith('AI Error');
    });

    it('should handle validation errors', async () => {
        const mockContent = JSON.stringify({
            files: [{ path: 'broken.ts', content: 'syntax error' }],
        });

        mockGeminiClient.generateStreaming.mockImplementation(async ({ onChunk }: any) => {
            onChunk(mockContent, mockContent.length);
            return { success: true, content: mockContent };
        });

        mockValidationPipeline.validate.mockReturnValue({
            valid: false,
            errors: [{ type: 'syntax', message: 'Syntax error' }],
        });

        const callbacks = {
            onError: vi.fn(),
        };

        const result = await generator.generateProjectStreaming('test', callbacks);

        expect(result.success).toBe(false);
        expect(callbacks.onError).toHaveBeenCalled();
        expect(result.validationErrors).toHaveLength(1);
    });
});
