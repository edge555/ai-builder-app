import { describe, expect, it, vi, beforeEach } from 'vitest';
import { StreamingProjectGenerator } from '../streaming-generator';
import { ValidationPipeline } from '../validation-pipeline';
import * as buildValidatorModule from '../build-validator';

vi.mock('../validation-pipeline');
vi.mock('../build-validator');

describe('StreamingProjectGenerator', () => {
    let generator: StreamingProjectGenerator;
    let mockAIProvider: any;
    let mockValidationPipeline: any;
    let mockBuildValidator: any;

    beforeEach(() => {
        mockAIProvider = {
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

        (ValidationPipeline as any).mockImplementation(function () { return mockValidationPipeline; });

        // Mock both class and factory function
        (buildValidatorModule.BuildValidator as any).mockImplementation(function () { return mockBuildValidator; });
        (buildValidatorModule.createBuildValidator as any).mockReturnValue(mockBuildValidator);

        generator = new StreamingProjectGenerator(mockAIProvider);
    });

    it('should generate a project with streaming emission', async () => {
        const mockContent = JSON.stringify({
            files: [
                { path: 'src/App.tsx', content: 'export default App;' },
                { path: 'package.json', content: '{}' },
            ],
        });

        mockAIProvider.generateStreaming.mockImplementation(async ({ onChunk }: any) => {
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
        mockAIProvider.generateStreaming.mockResolvedValue({
            success: false,
            error: 'AI Error',
        });

        const callbacks = {
            onError: vi.fn(),
        };

        const result = await generator.generateProjectStreaming('test', callbacks);

        expect(result.success).toBe(false);
        expect(callbacks.onError).toHaveBeenCalledWith('AI Error', expect.anything());
    });

    it('should handle validation errors', async () => {
        const mockContent = JSON.stringify({
            files: [{ path: 'broken.ts', content: 'syntax error' }],
        });

        mockAIProvider.generateStreaming.mockImplementation(async ({ onChunk }: any) => {
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

    it('should handle abort signal', async () => {
        const controller = new AbortController();
        const callbacks = {
            signal: controller.signal,
            onError: vi.fn(),
        };

        mockAIProvider.generateStreaming.mockImplementation(async ({ signal }: any) => {
            if (signal.aborted) {
                return { success: false, error: 'Request was cancelled' };
            }
            return { success: true, content: '{}' };
        });

        controller.abort();

        const result = await generator.generateProjectStreaming('test', callbacks);

        expect(result.success).toBe(false);
        expect(result.error).toContain('cancelled');
        expect(mockAIProvider.generateStreaming).toHaveBeenCalledWith(expect.objectContaining({
            signal: controller.signal
        }));
    });

});
