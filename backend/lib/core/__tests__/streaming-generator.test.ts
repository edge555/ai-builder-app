import { describe, expect, it, vi, beforeEach } from 'vitest';
import { StreamingProjectGenerator } from '../streaming-generator';
import { ValidationPipeline } from '../validation-pipeline';
import * as buildValidatorModule from '../build-validator';

vi.mock('../validation-pipeline');
vi.mock('../build-validator');

// Minimal PipelineResult helper
const makePipelineResult = (files = [
    { path: 'src/App.tsx', content: 'export default function App() { return null; }' },
    { path: 'package.json', content: '{}' },
]) => ({
    intentOutput: null,
    planOutput: null,
    executorFiles: files,
    reviewOutput: null,
    finalFiles: files,
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
            runGenerationPipeline: vi.fn(),
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
            validate: vi.fn(),
        };
        mockBuildValidator = {
            validate: vi.fn(),
            formatErrorsForAI: vi.fn(),
        };

        vi.mocked(ValidationPipeline).mockImplementation(function () { return mockValidationPipeline; });
        vi.mocked(buildValidatorModule.BuildValidator).mockImplementation(function () { return mockBuildValidator; });
        vi.mocked(buildValidatorModule.createBuildValidator).mockReturnValue(mockBuildValidator);

        generator = new StreamingProjectGenerator(mockPipeline, mockBugfixProvider, mockPromptProvider);
    });

    // ─── Basic happy path ─────────────────────────────────────────────────────

    it('should generate a project with streaming emission', async () => {
        mockPipeline.runGenerationPipeline.mockResolvedValue(makePipelineResult());

        mockValidationPipeline.validate.mockReturnValue({
            valid: true,
            sanitizedOutput: {
                'src/App.tsx': 'export default function App() { return null; }',
                'package.json': '{}',
            },
        });

        mockBuildValidator.validate.mockReturnValue({ valid: true, errors: [] });

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
        expect(callbacks.onStreamEnd).toHaveBeenCalled();
        expect(result.projectState).toBeDefined();
        expect(result.version).toBeDefined();
    });

    it('calls onStart before pipeline request', async () => {
        const callOrder: string[] = [];
        const callbacks = {
            onStart: vi.fn(() => callOrder.push('onStart')),
            onError: vi.fn(),
        };

        mockPipeline.runGenerationPipeline.mockImplementation(async () => {
            callOrder.push('pipeline');
            throw new Error('Pipeline Error');
        });

        await generator.generateProjectStreaming('test', callbacks);
        expect(callOrder[0]).toBe('onStart');
        expect(callOrder[1]).toBe('pipeline');
    });

    // ─── Empty/invalid description ────────────────────────────────────────────

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

    // ─── Pipeline errors ──────────────────────────────────────────────────────

    it('should handle pipeline errors', async () => {
        mockPipeline.runGenerationPipeline.mockRejectedValue(new Error('Pipeline Error'));

        const callbacks = {
            onError: vi.fn(),
            onStreamEnd: vi.fn(),
        };

        const result = await generator.generateProjectStreaming('test', callbacks);

        expect(result.success).toBe(false);
        expect(callbacks.onError).toHaveBeenCalledWith('Pipeline Error');
        expect(callbacks.onStreamEnd).toHaveBeenCalledWith(expect.objectContaining({
            successfulFiles: 0,
        }));
    });

    // ─── Validation errors ────────────────────────────────────────────────────

    it('should handle validation errors', async () => {
        mockPipeline.runGenerationPipeline.mockResolvedValue(makePipelineResult());

        mockValidationPipeline.validate.mockReturnValue({
            valid: false,
            errors: [{ type: 'syntax', message: 'Syntax error' }],
        });

        const callbacks = { onError: vi.fn() };
        const result = await generator.generateProjectStreaming('test', callbacks);

        expect(result.success).toBe(false);
        expect(callbacks.onError).toHaveBeenCalled();
        expect(result.validationErrors).toHaveLength(1);
    });

    it('calls onWarning for validation warnings', async () => {
        mockPipeline.runGenerationPipeline.mockResolvedValue(makePipelineResult());

        mockValidationPipeline.validate.mockReturnValue({
            valid: true,
            warnings: [{ filePath: 'src/App.tsx', message: 'Unused import' }],
            sanitizedOutput: {
                'src/App.tsx': 'export default function App() { return null; }',
                'package.json': '{}',
            },
        });
        mockBuildValidator.validate.mockReturnValue({ valid: true, errors: [] });

        const onWarning = vi.fn();
        await generator.generateProjectStreaming('test', { onWarning });

        expect(onWarning).toHaveBeenCalledWith(expect.objectContaining({
            path: 'src/App.tsx',
            type: 'validation',
        }));
    });

    // ─── Pipeline stage callbacks ─────────────────────────────────────────────

    it('emits onPipelineStage for each stage start/complete', async () => {
        mockPipeline.runGenerationPipeline.mockImplementation(
            async (_prompt: string, callbacks: any) => {
                callbacks.onStageStart?.('intent', 'Analyzing...');
                callbacks.onStageComplete?.('intent');
                callbacks.onStageStart?.('execution', 'Generating...');
                callbacks.onStageComplete?.('execution');
                return makePipelineResult();
            }
        );

        mockValidationPipeline.validate.mockReturnValue({
            valid: true,
            sanitizedOutput: {
                'src/App.tsx': 'export default function App() { return null; }',
                'package.json': '{}',
            },
        });
        mockBuildValidator.validate.mockReturnValue({ valid: true, errors: [] });

        const onPipelineStage = vi.fn();
        await generator.generateProjectStreaming('test', { onPipelineStage });

        expect(onPipelineStage).toHaveBeenCalledWith({ stage: 'intent', label: 'Analyzing...', status: 'start' });
        expect(onPipelineStage).toHaveBeenCalledWith({ stage: 'intent', label: '', status: 'complete' });
        expect(onPipelineStage).toHaveBeenCalledWith({ stage: 'execution', label: 'Generating...', status: 'start' });
    });

    it('emits degraded status when a stage fails', async () => {
        mockPipeline.runGenerationPipeline.mockImplementation(
            async (_prompt: string, callbacks: any) => {
                callbacks.onStageFailed?.('intent', 'timeout');
                return makePipelineResult();
            }
        );

        mockValidationPipeline.validate.mockReturnValue({
            valid: true,
            sanitizedOutput: {
                'src/App.tsx': 'export default function App() { return null; }',
                'package.json': '{}',
            },
        });
        mockBuildValidator.validate.mockReturnValue({ valid: true, errors: [] });

        const onPipelineStage = vi.fn();
        await generator.generateProjectStreaming('test', { onPipelineStage });

        expect(onPipelineStage).toHaveBeenCalledWith({ stage: 'intent', label: 'timeout', status: 'degraded' });
    });

    // ─── onProgress during execution chunk ───────────────────────────────────

    it('calls onProgress during execution chunk', async () => {
        const mockContent = JSON.stringify({ files: [
            { path: 'src/App.tsx', content: 'export default function App() { return null; }' },
        ]});

        mockPipeline.runGenerationPipeline.mockImplementation(
            async (_prompt: string, callbacks: any) => {
                callbacks.onExecutionChunk?.(mockContent.slice(0, 10), 10);
                callbacks.onExecutionChunk?.(mockContent.slice(10), mockContent.length);
                return makePipelineResult();
            }
        );

        mockValidationPipeline.validate.mockReturnValue({
            valid: true,
            sanitizedOutput: {
                'src/App.tsx': 'export default function App() { return null; }',
                'package.json': '{}',
            },
        });
        mockBuildValidator.validate.mockReturnValue({ valid: true, errors: [] });

        const onProgress = vi.fn();
        await generator.generateProjectStreaming('test', { onProgress });

        expect(onProgress).toHaveBeenCalledWith(10);
        expect(onProgress).toHaveBeenCalledWith(mockContent.length);
    });

    // ─── File emission ────────────────────────────────────────────────────────

    it('emits files with complete status after processing', async () => {
        mockPipeline.runGenerationPipeline.mockResolvedValue(makePipelineResult());

        mockValidationPipeline.validate.mockReturnValue({
            valid: true,
            sanitizedOutput: {
                'src/App.tsx': 'export default function App() { return null; }',
                'package.json': '{}',
            },
        });
        mockBuildValidator.validate.mockReturnValue({ valid: true, errors: [] });

        const onFile = vi.fn();
        await generator.generateProjectStreaming('test', { onFile });

        const completeCalls = onFile.mock.calls.filter(c => c[0].status === 'complete');
        expect(completeCalls.length).toBeGreaterThan(0);
        expect(completeCalls[0][0]).toMatchObject({ status: 'complete' });
    });

    // ─── onStreamEnd summary ──────────────────────────────────────────────────

    it('emits correct stream-end summary on success', async () => {
        mockPipeline.runGenerationPipeline.mockResolvedValue(makePipelineResult());

        mockValidationPipeline.validate.mockReturnValue({
            valid: true,
            sanitizedOutput: {
                'src/App.tsx': 'export default function App() { return null; }',
                'package.json': '{}',
            },
        });
        mockBuildValidator.validate.mockReturnValue({ valid: true, errors: [] });

        const onStreamEnd = vi.fn();
        await generator.generateProjectStreaming('test', { onStreamEnd });

        expect(onStreamEnd).toHaveBeenCalledWith(expect.objectContaining({
            totalFiles: 2,
            successfulFiles: 2,
            failedFiles: 0,
            warnings: 0,
        }));
    });

    // ─── Abort signal ─────────────────────────────────────────────────────────

    it('passes abort signal to pipeline', async () => {
        const controller = new AbortController();
        mockPipeline.runGenerationPipeline.mockRejectedValue(new Error('cancelled'));

        const callbacks = {
            signal: controller.signal,
            onError: vi.fn(),
        };

        controller.abort();
        await generator.generateProjectStreaming('test', callbacks);

        expect(mockPipeline.runGenerationPipeline).toHaveBeenCalledWith(
            'test',
            expect.objectContaining({ signal: controller.signal }),
            expect.any(Object)
        );
    });

    it('returns cancelled when signal aborted before build-fix', async () => {
        const controller = new AbortController();

        mockPipeline.runGenerationPipeline.mockImplementation(async () => {
            controller.abort();
            return makePipelineResult();
        });

        mockValidationPipeline.validate.mockReturnValue({
            valid: true,
            sanitizedOutput: { 'src/App.tsx': 'export default function App() { return null; }', 'package.json': '{}' },
        });

        const result = await generator.generateProjectStreaming('test', { signal: controller.signal });
        expect(result.success).toBe(false);
        expect(result.error).toContain('cancelled');
    });

    // ─── projectState and version structure ───────────────────────────────────

    it('result contains projectState with correct structure', async () => {
        mockPipeline.runGenerationPipeline.mockResolvedValue(makePipelineResult());

        mockValidationPipeline.validate.mockReturnValue({
            valid: true,
            sanitizedOutput: {
                'src/App.tsx': 'export default function App() { return null; }',
                'package.json': '{}',
            },
        });
        mockBuildValidator.validate.mockReturnValue({ valid: true, errors: [] });

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

    // ─── Request ID propagation ───────────────────────────────────────────────

    it('passes requestId to pipeline', async () => {
        mockPipeline.runGenerationPipeline.mockRejectedValue(new Error('err'));

        await generator.generateProjectStreaming('test', {}, { requestId: 'req-123' });

        expect(mockPipeline.runGenerationPipeline).toHaveBeenCalledWith(
            'test',
            expect.any(Object),
            expect.objectContaining({ requestId: 'req-123' })
        );
    });
});
