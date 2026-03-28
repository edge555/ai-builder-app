import { describe, expect, it, vi, beforeEach } from 'vitest';
import { StreamingProjectGenerator } from '../streaming-generator';
import { ValidationPipeline } from '../validation-pipeline';
import * as buildValidatorModule from '../build-validator';

vi.mock('../validation-pipeline');
vi.mock('../build-validator');

// Prevent WorkerPool from spawning real Prettier worker threads in unit tests.
// processFiles is an implementation detail; StreamingProjectGenerator's logic
// is what we're testing here.
vi.mock('../file-processor', () => ({
    processFiles: vi.fn(async (files: Array<{ path: string; content: string }>) => ({
        files: Object.fromEntries(files.map(f => [f.path, f.content])),
        warnings: [],
    })),
    processFile: vi.fn(async (file: { path: string; content: string }) => file),
}));

// Minimal PipelineResult helper
const makeGenerationResult = (files = [
    { path: 'src/App.tsx', content: 'export default function App() { return null; }' },
    { path: 'package.json', content: '{}' },
]) => ({
    intentOutput: null, architecturePlan: null, complexityRoute: 'one-shot', generatedFiles: files, warnings: [],
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
            validate: vi.fn(),
        };
        mockBuildValidator = {
            validate: vi.fn().mockReturnValue({ valid: true, errors: [] }),
            formatErrorsForAI: vi.fn(),
        };

        vi.mocked(ValidationPipeline).mockImplementation(function () { return mockValidationPipeline; });
        vi.mocked(buildValidatorModule.BuildValidator).mockImplementation(function () { return mockBuildValidator; });
        vi.mocked(buildValidatorModule.createBuildValidator).mockReturnValue(mockBuildValidator);

        generator = new StreamingProjectGenerator(mockPipeline, mockBugfixProvider, mockPromptProvider);
    });

    // ─── Basic happy path ─────────────────────────────────────────────────────

    it('should generate a project with streaming emission', async () => {
        mockPipeline.runGeneration.mockResolvedValue(makeGenerationResult());

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

        mockPipeline.runGeneration.mockImplementation(async () => {
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
        mockPipeline.runGeneration.mockRejectedValue(new Error('Pipeline Error'));

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

    // ─── Syntax-error file dropping (Phase 4) ────────────────────────────────

    it('drops a broken file, delivers the rest, and fires onWarning', async () => {
        // Include main.tsx so the safety-net injector doesn't add a 4th file
        const canonicalMain = `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nimport './index.css';\nReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);\n`;
        const inputFiles = [
            { path: 'src/main.tsx',   content: canonicalMain },
            { path: 'src/App.tsx',    content: 'export default function App() { return null; }' },
            { path: 'src/Broken.tsx', content: 'this is not valid }{' },
            { path: 'package.json',   content: '{}' },
        ];
        mockPipeline.runGeneration.mockResolvedValue(makeGenerationResult(inputFiles));

        // buildValidator flags the broken file as a syntax_error on first call
        mockBuildValidator.validate
            .mockReturnValueOnce({
                valid: false,
                errors: [{ type: 'syntax_error', file: 'src/Broken.tsx', message: 'Unexpected token', severity: 'fixable' }],
            })
            // second call from runBuildFixLoop — no errors
            .mockReturnValue({ valid: true, errors: [] });

        const onWarning = vi.fn();
        const result = await generator.generateProjectStreaming('test', { onWarning });

        expect(result.success).toBe(true);
        // broken file not in final output
        expect(result.projectState!.files['src/Broken.tsx']).toBeUndefined();
        // three remaining files delivered (main.tsx, App.tsx, package.json)
        expect(Object.keys(result.projectState!.files)).toHaveLength(3);
        // onWarning fired for the dropped file
        expect(onWarning).toHaveBeenCalledWith(expect.objectContaining({
            path: 'src/Broken.tsx',
            type: 'validation',
        }));
    });

    it('does not call validationPipeline.validate', async () => {
        mockPipeline.runGeneration.mockResolvedValue(makeGenerationResult());

        await generator.generateProjectStreaming('test', {});

        expect(mockValidationPipeline.validate).not.toHaveBeenCalled();
    });

    // ─── Pipeline stage callbacks ─────────────────────────────────────────────

    it('emits onPipelineStage for each stage start/complete', async () => {
        mockPipeline.runGeneration.mockImplementation(
            async (_prompt: string, callbacks: any) => {
                callbacks.onStageStart?.('intent', 'Analyzing...');
                callbacks.onStageComplete?.('intent');
                callbacks.onStageStart?.('execution', 'Generating...');
                callbacks.onStageComplete?.('execution');
                return makeGenerationResult();
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
        mockPipeline.runGeneration.mockImplementation(
            async (_prompt: string, callbacks: any) => {
                callbacks.onStageFailed?.('intent', 'timeout');
                return makeGenerationResult();
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

    it('calls onProgress and onFileStream during execution', async () => {
        const mockFile = { path: 'src/App.tsx', content: 'export default function App() { return null; }' };

        mockPipeline.runGeneration.mockImplementation(
            async (_prompt: string, callbacks: any) => {
                callbacks.onProgress?.(10);
                callbacks.onFileStream?.(mockFile, false);
                callbacks.onProgress?.(50);
                callbacks.onFileStream?.(mockFile, true);
                return makeGenerationResult();
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
        const onFile = vi.fn();
        await generator.generateProjectStreaming('test', { onProgress, onFile });

        expect(onProgress).toHaveBeenCalledWith(10);
        expect(onProgress).toHaveBeenCalledWith(50);
        // 2 streaming onFile calls + 3 final onFile calls (App.tsx, package.json, injected main.tsx)
        expect(onFile).toHaveBeenCalledTimes(5);
    });

    // ─── File emission ────────────────────────────────────────────────────────

    it('emits files with complete status after processing', async () => {
        mockPipeline.runGeneration.mockResolvedValue(makeGenerationResult());

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
        mockPipeline.runGeneration.mockResolvedValue(makeGenerationResult());

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

        // makeGenerationResult has App.tsx + package.json; main.tsx injected as safety net → 3 total
        expect(onStreamEnd).toHaveBeenCalledWith(expect.objectContaining({
            totalFiles: 3,
            successfulFiles: 3,
            failedFiles: 0,
            warnings: 0,
        }));
    });

    // ─── Abort signal ─────────────────────────────────────────────────────────

    it('passes abort signal to pipeline', async () => {
        const controller = new AbortController();
        mockPipeline.runGeneration.mockRejectedValue(new Error('cancelled'));

        const callbacks = {
            signal: controller.signal,
            onError: vi.fn(),
        };

        controller.abort();
        await generator.generateProjectStreaming('test', callbacks);

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

    // ─── projectState and version structure ───────────────────────────────────

    it('result contains projectState with correct structure', async () => {
        mockPipeline.runGeneration.mockResolvedValue(makeGenerationResult());

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
        mockPipeline.runGeneration.mockRejectedValue(new Error('err'));

        await generator.generateProjectStreaming('test', {}, { requestId: 'req-123' });

        expect(mockPipeline.runGeneration).toHaveBeenCalledWith(
            'test',
            expect.any(Object),
            expect.objectContaining({ requestId: 'req-123' })
        );
    });
});
