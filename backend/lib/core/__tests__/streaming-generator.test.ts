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

    const makeValidContent = (files = [
        { path: 'src/App.tsx', content: 'export default function App() { return null; }' },
        { path: 'package.json', content: '{}' },
    ]) => JSON.stringify({ files });

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

        vi.mocked(ValidationPipeline).mockImplementation(function () { return mockValidationPipeline; });
        vi.mocked(buildValidatorModule.BuildValidator).mockImplementation(function () { return mockBuildValidator; });
        vi.mocked(buildValidatorModule.createBuildValidator).mockReturnValue(mockBuildValidator);

        generator = new StreamingProjectGenerator(mockAIProvider);
    });

    // ─── Basic happy path ─────────────────────────────────────────────────────

    it('should generate a project with streaming emission', async () => {
        const mockContent = makeValidContent();

        mockAIProvider.generateStreaming.mockImplementation(async ({ onChunk }: any) => {
            onChunk(mockContent, mockContent.length);
            return { success: true, content: mockContent };
        });

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

    it('calls onStart before AI request', async () => {
        const callOrder: string[] = [];
        const callbacks = {
            onStart: vi.fn(() => callOrder.push('onStart')),
            onError: vi.fn(),
        };

        mockAIProvider.generateStreaming.mockImplementation(async () => {
            callOrder.push('ai');
            return { success: false, error: 'AI Error' };
        });

        await generator.generateProjectStreaming('test', callbacks);
        expect(callOrder[0]).toBe('onStart');
        expect(callOrder[1]).toBe('ai');
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

    // ─── AI errors ────────────────────────────────────────────────────────────

    it('should handle AI errors during streaming', async () => {
        mockAIProvider.generateStreaming.mockResolvedValue({
            success: false,
            error: 'AI Error',
        });

        const callbacks = {
            onError: vi.fn(),
            onStreamEnd: vi.fn(),
        };

        const result = await generator.generateProjectStreaming('test', callbacks);

        expect(result.success).toBe(false);
        expect(callbacks.onError).toHaveBeenCalledWith('AI Error', expect.anything());
        expect(callbacks.onStreamEnd).toHaveBeenCalledWith(expect.objectContaining({
            successfulFiles: 0,
        }));
    });

    it('propagates errorCode and errorType from AI response', async () => {
        mockAIProvider.generateStreaming.mockResolvedValue({
            success: false,
            error: 'Rate limited',
            errorCode: 'RATE_LIMIT',
            errorType: 'rate_limit',
        });

        const onError = vi.fn();
        await generator.generateProjectStreaming('test', { onError });

        expect(onError).toHaveBeenCalledWith('Rate limited', expect.objectContaining({
            errorCode: 'RATE_LIMIT',
            errorType: 'rate_limit',
        }));
    });

    // ─── JSON parse errors ────────────────────────────────────────────────────

    it('should handle invalid JSON response from AI', async () => {
        mockAIProvider.generateStreaming.mockResolvedValue({
            success: true,
            content: 'not valid json {{{',
        });

        const onError = vi.fn();
        const result = await generator.generateProjectStreaming('test', { onError });

        expect(result.success).toBe(false);
        expect(onError).toHaveBeenCalled();
        expect(result.error).toContain('Failed to parse AI response');
    });

    // ─── Validation errors ────────────────────────────────────────────────────

    it('should handle validation errors', async () => {
        const mockContent = makeValidContent();

        mockAIProvider.generateStreaming.mockImplementation(async ({ onChunk }: any) => {
            onChunk(mockContent, mockContent.length);
            return { success: true, content: mockContent };
        });

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
        const mockContent = makeValidContent();

        mockAIProvider.generateStreaming.mockImplementation(async ({ onChunk }: any) => {
            onChunk(mockContent, mockContent.length);
            return { success: true, content: mockContent };
        });

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

    // ─── Abort signal ─────────────────────────────────────────────────────────

    it('should handle abort signal passed to AI provider', async () => {
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
        expect(mockAIProvider.generateStreaming).toHaveBeenCalledWith(expect.objectContaining({
            signal: controller.signal
        }));
    });

    it('returns cancelled when signal aborted before build-fix', async () => {
        const controller = new AbortController();
        const mockContent = makeValidContent();

        mockAIProvider.generateStreaming.mockImplementation(async ({ onChunk }: any) => {
            onChunk(mockContent, mockContent.length);
            // Abort after streaming completes but before build-fix
            controller.abort();
            return { success: true, content: mockContent };
        });

        mockValidationPipeline.validate.mockReturnValue({
            valid: true,
            sanitizedOutput: { 'src/App.tsx': 'export default function App() { return null; }', 'package.json': '{}' },
        });

        const result = await generator.generateProjectStreaming('test', { signal: controller.signal });
        expect(result.success).toBe(false);
        expect(result.error).toContain('cancelled');
    });

    // ─── onProgress callback ──────────────────────────────────────────────────

    it('calls onProgress during streaming', async () => {
        const mockContent = makeValidContent();
        const onProgress = vi.fn();

        mockAIProvider.generateStreaming.mockImplementation(async ({ onChunk }: any) => {
            onChunk(mockContent.slice(0, 10), 10);
            onChunk(mockContent.slice(10), mockContent.length);
            return { success: true, content: mockContent };
        });

        mockValidationPipeline.validate.mockReturnValue({
            valid: true,
            sanitizedOutput: { 'src/App.tsx': 'export default function App() { return null; }', 'package.json': '{}' },
        });
        mockBuildValidator.validate.mockReturnValue({ valid: true, errors: [] });

        await generator.generateProjectStreaming('test', { onProgress });

        expect(onProgress).toHaveBeenCalledWith(10);
        expect(onProgress).toHaveBeenCalledWith(mockContent.length);
    });

    // ─── File emission ────────────────────────────────────────────────────────

    it('emits files with complete status after processing', async () => {
        const mockContent = makeValidContent();
        const onFile = vi.fn();

        mockAIProvider.generateStreaming.mockImplementation(async ({ onChunk }: any) => {
            onChunk(mockContent, mockContent.length);
            return { success: true, content: mockContent };
        });

        mockValidationPipeline.validate.mockReturnValue({
            valid: true,
            sanitizedOutput: {
                'src/App.tsx': 'export default function App() { return null; }',
                'package.json': '{}',
            },
        });
        mockBuildValidator.validate.mockReturnValue({ valid: true, errors: [] });

        await generator.generateProjectStreaming('test', { onFile });

        // Final file emissions should be 'complete'
        const completeCalls = onFile.mock.calls.filter(c => c[0].status === 'complete');
        expect(completeCalls.length).toBeGreaterThan(0);
        expect(completeCalls[0][0]).toMatchObject({ status: 'complete' });
    });

    // ─── onStreamEnd summary ──────────────────────────────────────────────────

    it('emits correct stream-end summary on success', async () => {
        const mockContent = makeValidContent();
        const onStreamEnd = vi.fn();

        mockAIProvider.generateStreaming.mockImplementation(async ({ onChunk }: any) => {
            onChunk(mockContent, mockContent.length);
            return { success: true, content: mockContent };
        });

        mockValidationPipeline.validate.mockReturnValue({
            valid: true,
            sanitizedOutput: {
                'src/App.tsx': 'export default function App() { return null; }',
                'package.json': '{}',
            },
        });
        mockBuildValidator.validate.mockReturnValue({ valid: true, errors: [] });

        await generator.generateProjectStreaming('test', { onStreamEnd });

        expect(onStreamEnd).toHaveBeenCalledWith(expect.objectContaining({
            totalFiles: 2,
            successfulFiles: 2,
            failedFiles: 0,
            warnings: 0,
        }));
    });

    // ─── Request ID propagation ───────────────────────────────────────────────

    it('passes requestId to AI provider', async () => {
        mockAIProvider.generateStreaming.mockResolvedValue({
            success: false,
            error: 'AI Error',
        });

        await generator.generateProjectStreaming('test', {}, { requestId: 'req-123' });

        expect(mockAIProvider.generateStreaming).toHaveBeenCalledWith(
            expect.objectContaining({ requestId: 'req-123' })
        );
    });

    // ─── Zod validation ───────────────────────────────────────────────────────

    it('handles invalid Zod schema (missing files array)', async () => {
        mockAIProvider.generateStreaming.mockResolvedValue({
            success: true,
            content: JSON.stringify({ not_files: [] }),
        });

        const onError = vi.fn();
        const result = await generator.generateProjectStreaming('test', { onError });

        expect(result.success).toBe(false);
        expect(onError).toHaveBeenCalled();
        expect(result.error).toContain('Invalid AI response structure');
    });

    // ─── projectState and version structure ───────────────────────────────────

    it('result contains projectState with correct structure', async () => {
        const mockContent = makeValidContent();

        mockAIProvider.generateStreaming.mockImplementation(async ({ onChunk }: any) => {
            onChunk(mockContent, mockContent.length);
            return { success: true, content: mockContent };
        });

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
});
