import { describe, expect, it, vi, beforeEach } from 'vitest';
import { StreamingProjectGenerator } from '../streaming-generator';
import { ValidationPipeline } from '../validation-pipeline';
import * as buildValidatorModule from '../build-validator';

vi.mock('../validation-pipeline');
vi.mock('../build-validator');

vi.mock('../file-processor', () => ({
    processFiles: vi.fn(async (files: Array<{ path: string; content: string }>) => ({
        files: Object.fromEntries(files.map((file) => [file.path, file.content])),
        warnings: [],
    })),
    processFile: vi.fn(async (file: { path: string; content: string }) => file),
}));

const canonicalMain = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
`;

const makeGenerationResult = (files = [
    { path: 'src/main.tsx', content: canonicalMain },
    { path: 'src/App.tsx', content: 'export default function App() { return null; }' },
    { path: 'src/index.css', content: ':root { --color-bg: #fff; }' },
    { path: 'package.json', content: '{}' },
]) => ({
    intentOutput: null,
    architecturePlan: null,
    complexityRoute: 'one-shot',
    generatedFiles: files,
    warnings: [],
});

describe('StreamingProjectGenerator', () => {
    let generator: StreamingProjectGenerator;
    let mockPipeline: any;
    let mockBugfixProvider: any;
    let mockPromptProvider: any;
    let mockValidationPipeline: any;
    let mockBuildValidator: any;

    beforeEach(() => {
        mockPipeline = {
            runGeneration: vi.fn(),
        };
        mockBugfixProvider = {
            generate: vi.fn(),
        };
        mockPromptProvider = {
            getBugfixSystemPrompt: vi.fn().mockReturnValue('fix errors'),
            tokenBudgets: {
                bugfix: 8192,
                executionGeneration: 28000,
                executionModification: 28000,
                intent: 512,
                planning: 4096,
                review: 32768,
            },
        };
        mockValidationPipeline = {
            validate: vi.fn().mockImplementation((files: Record<string, string>) => ({
                valid: true,
                errors: [],
                sanitizedOutput: files,
            })),
        };
        mockBuildValidator = {
            validate: vi.fn().mockReturnValue({ valid: true, errors: [] }),
            validateAll: vi.fn().mockReturnValue({ valid: true, errors: [] }),
            validateCrossFileReferences: vi.fn().mockReturnValue([]),
            formatErrorsForAI: vi.fn(),
        };

        vi.mocked(ValidationPipeline).mockImplementation(function () { return mockValidationPipeline; });
        vi.mocked(buildValidatorModule.BuildValidator).mockImplementation(function () { return mockBuildValidator; });
        vi.mocked(buildValidatorModule.createBuildValidator).mockReturnValue(mockBuildValidator);

        generator = new StreamingProjectGenerator(mockPipeline, mockBugfixProvider, mockPromptProvider);
    });

    it('should generate a project with streaming emission', async () => {
        mockPipeline.runGeneration.mockResolvedValue(makeGenerationResult());

        const callbacks = {
            onStart: vi.fn(),
            onFile: vi.fn(),
            onComplete: vi.fn(),
            onStreamEnd: vi.fn(),
        };

        const result = await generator.generateProjectStreaming('A test project', callbacks);

        expect(result.success).toBe(true);
        expect(callbacks.onStart).toHaveBeenCalledTimes(1);
        expect(callbacks.onComplete).toHaveBeenCalled();
        expect(callbacks.onStreamEnd).toHaveBeenCalledWith(expect.objectContaining({
            totalFiles: 4,
            successfulFiles: 4,
        }));
        expect(result.projectState).toBeDefined();
        expect(result.version).toBeDefined();
    });

    it('calls onStart before pipeline request', async () => {
        const callOrder: string[] = [];
        const callbacks = {
            onStart: vi.fn(() => callOrder.push('onStart')),
            onError: vi.fn(),
        };

        mockPipeline.runGeneration.mockImplementation(async () => {
            callOrder.push('pipeline');
            throw new Error('Pipeline Error');
        });

        await generator.generateProjectStreaming('test', callbacks);
        expect(callOrder).toEqual(['onStart', 'pipeline']);
    });

    it('should return error for empty description', async () => {
        const result = await generator.generateProjectStreaming('', {});
        expect(result.success).toBe(false);
        expect(result.error).toContain('description is required');
    });

    it('should return error for whitespace-only description', async () => {
        const result = await generator.generateProjectStreaming('   ', {});
        expect(result.success).toBe(false);
        expect(result.error).toContain('description is required');
    });

    it('should handle pipeline errors', async () => {
        mockPipeline.runGeneration.mockRejectedValue(new Error('Pipeline Error'));

        const callbacks = {
            onError: vi.fn(),
            onStreamEnd: vi.fn(),
        };

        const result = await generator.generateProjectStreaming('test', callbacks);

        expect(result.success).toBe(false);
        expect(callbacks.onError).toHaveBeenCalledWith('Pipeline Error', expect.anything());
        expect(callbacks.onStreamEnd).toHaveBeenCalledWith(expect.objectContaining({
            successfulFiles: 0,
        }));
    });

    it('fails generation when required scaffold files are missing', async () => {
        mockPipeline.runGeneration.mockResolvedValue(makeGenerationResult([
            { path: 'src/App.tsx', content: 'export default function App() { return null; }' },
            { path: 'package.json', content: '{}' },
        ]));

        const onError = vi.fn();
        const onStreamEnd = vi.fn();
        const result = await generator.generateProjectStreaming('test', { onError, onStreamEnd });

        expect(result.success).toBe(false);
        expect(result.error).toContain('missing or invalid required scaffold files');
        expect(onError).toHaveBeenCalledWith(
            expect.stringContaining('missing or invalid required scaffold files'),
            expect.objectContaining({ errorCode: 'generation_acceptance_failed', errorType: 'ai_output' })
        );
        expect(onStreamEnd).toHaveBeenCalledWith(expect.objectContaining({ successfulFiles: 0 }));
    });

    it('fails generation when acceptance validation finds errors', async () => {
        mockPipeline.runGeneration.mockResolvedValue(makeGenerationResult());
        mockBuildValidator.validateAll.mockReturnValueOnce({
            valid: false,
            errors: [{ type: 'syntax_error', file: 'src/App.tsx', message: 'Unexpected token', severity: 'fixable' }],
        });

        const onError = vi.fn();
        const result = await generator.generateProjectStreaming('test', { onError });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Generation failed acceptance');
        expect(onError).toHaveBeenCalledWith(
            expect.stringContaining('Generation failed acceptance'),
            expect.objectContaining({ errorType: 'validation' })
        );
    });

    it('runs the shared acceptance gate validation pipeline', async () => {
        mockPipeline.runGeneration.mockResolvedValue(makeGenerationResult());

        await generator.generateProjectStreaming('test', {});

        expect(mockValidationPipeline.validate).toHaveBeenCalledWith(expect.objectContaining({
            'src/main.tsx': expect.any(String),
            'src/App.tsx': expect.any(String),
            'src/index.css': expect.any(String),
            'package.json': expect.any(String),
        }));
        expect(mockBuildValidator.validateAll).toHaveBeenCalled();
        expect(mockBuildValidator.validateCrossFileReferences).toHaveBeenCalled();
    });

    it('emits onPipelineStage for each stage start/complete', async () => {
        mockPipeline.runGeneration.mockImplementation(async (_prompt: string, callbacks: any) => {
            callbacks.onStageStart?.('intent', 'Analyzing...');
            callbacks.onStageComplete?.('intent');
            callbacks.onStageStart?.('execution', 'Generating...');
            callbacks.onStageComplete?.('execution');
            return makeGenerationResult();
        });

        const onPipelineStage = vi.fn();
        await generator.generateProjectStreaming('test', { onPipelineStage });

        expect(onPipelineStage).toHaveBeenCalledWith({ stage: 'intent', label: 'Analyzing...', status: 'start' });
        expect(onPipelineStage).toHaveBeenCalledWith({ stage: 'intent', label: '', status: 'complete' });
        expect(onPipelineStage).toHaveBeenCalledWith({ stage: 'execution', label: 'Generating...', status: 'start' });
    });

    it('emits degraded status when a stage fails', async () => {
        mockPipeline.runGeneration.mockImplementation(async (_prompt: string, callbacks: any) => {
            callbacks.onStageFailed?.('intent', 'timeout');
            return makeGenerationResult();
        });

        const onPipelineStage = vi.fn();
        await generator.generateProjectStreaming('test', { onPipelineStage });

        expect(onPipelineStage).toHaveBeenCalledWith({ stage: 'intent', label: 'timeout', status: 'degraded' });
    });

    it('calls onProgress and onFileStream during execution', async () => {
        const mockFile = { path: 'src/App.tsx', content: 'export default function App() { return null; }' };

        mockPipeline.runGeneration.mockImplementation(async (_prompt: string, callbacks: any) => {
            callbacks.onProgress?.(10);
            callbacks.onFileStream?.(mockFile, false);
            callbacks.onProgress?.(50);
            callbacks.onFileStream?.(mockFile, true);
            return makeGenerationResult();
        });

        const onProgress = vi.fn();
        const onFile = vi.fn();
        await generator.generateProjectStreaming('test', { onProgress, onFile });

        expect(onProgress).toHaveBeenCalledWith(10);
        expect(onProgress).toHaveBeenCalledWith(50);
        expect(onFile).toHaveBeenCalledTimes(6);
    });

    it('emits files with complete status after processing', async () => {
        mockPipeline.runGeneration.mockResolvedValue(makeGenerationResult());

        const onFile = vi.fn();
        await generator.generateProjectStreaming('test', { onFile });

        const completeCalls = onFile.mock.calls.filter((call) => call[0].status === 'complete');
        expect(completeCalls.length).toBeGreaterThan(0);
        expect(completeCalls[0][0]).toMatchObject({ status: 'complete' });
    });

    it('emits correct stream-end summary on success', async () => {
        mockPipeline.runGeneration.mockResolvedValue(makeGenerationResult());

        const onStreamEnd = vi.fn();
        await generator.generateProjectStreaming('test', { onStreamEnd });

        expect(onStreamEnd).toHaveBeenCalledWith(expect.objectContaining({
            totalFiles: 4,
            successfulFiles: 4,
            failedFiles: 0,
            warnings: 0,
        }));
    });

    it('passes abort signal to pipeline', async () => {
        const controller = new AbortController();
        mockPipeline.runGeneration.mockRejectedValue(new Error('cancelled'));

        controller.abort();
        await generator.generateProjectStreaming('test', {
            signal: controller.signal,
            onError: vi.fn(),
        });

        expect(mockPipeline.runGeneration).toHaveBeenCalledWith(
            'test',
            expect.objectContaining({ signal: controller.signal }),
            expect.any(Object)
        );
    });

    it('returns cancelled when signal aborted before build-fix', async () => {
        const controller = new AbortController();

        mockPipeline.runGeneration.mockImplementation(async () => {
            controller.abort();
            return makeGenerationResult();
        });

        const result = await generator.generateProjectStreaming('test', { signal: controller.signal });
        expect(result.success).toBe(false);
        expect(result.error).toContain('cancelled');
    });

    it('result contains projectState with correct structure', async () => {
        mockPipeline.runGeneration.mockResolvedValue(makeGenerationResult());

        const result = await generator.generateProjectStreaming('A weather dashboard', {});

        expect(result.success).toBe(true);
        expect(result.projectState).toMatchObject({
            id: expect.any(String),
            name: expect.any(String),
            description: 'A weather dashboard',
            files: expect.any(Object),
        });
        expect(result.version).toMatchObject({
            id: expect.any(String),
            projectId: result.projectState!.id,
            prompt: 'A weather dashboard',
            parentVersionId: null,
            diffs: expect.any(Object),
        });
    });

    it('passes requestId to pipeline', async () => {
        mockPipeline.runGeneration.mockRejectedValue(new Error('err'));

        await generator.generateProjectStreaming('test', {}, { requestId: 'req-123' });

        expect(mockPipeline.runGeneration).toHaveBeenCalledWith(
            'test',
            expect.any(Object),
            expect.objectContaining({ requestId: 'req-123' })
        );
    });
});
