import { describe, expect, it, vi, beforeEach } from 'vitest';

import { createGenerationApiService } from '../generationApiService';

vi.mock('@/utils/sse-parser', () => ({
    parseSSEStream: vi.fn(),
}));

vi.mock('@/integrations/backend/client', () => ({
    FUNCTIONS_BASE_URL: 'http://localhost/functions',
    SUPABASE_ANON_KEY: 'test-key',
}));

vi.mock('../../config', () => ({
    config: { api: { timeout: 30000 } },
}));

const makeProjectState = (id = 'p1') => ({
    id,
    name: 'Test',
    description: '',
    files: {},
    createdAt: '',
    updatedAt: '',
    currentVersionId: '',
});

describe('generationApiService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', vi.fn());
    });

    it('modifyProjectStreaming sends request and returns streamed result', async () => {
        const { parseSSEStream } = await import('@/utils/sse-parser');
        const snapshots: string[] = [];

        (fetch as any).mockResolvedValue({
            ok: true,
            headers: { get: () => null },
            body: { getReader: () => ({}) },
        });

        (parseSSEStream as any).mockImplementation(async (_reader: unknown, handlers: Record<string, Function>) => {
            handlers.onComplete?.({
                projectState: { files: { 'src/App.tsx': 'code' } },
                diffs: [{ path: 'src/App.tsx', type: 'modified' }],
                changeSummary: { description: 'Updated app', affectedFiles: ['src/App.tsx'] },
                partialSuccess: true,
                rolledBackFiles: ['src/Old.tsx'],
            }, { 'src/App.tsx': 'code' });

            return { success: true, projectState: { files: { 'src/App.tsx': 'code' } } };
        });

        const service = createGenerationApiService({
            onStreamSnapshot: snapshot => snapshots.push(snapshot.phase),
            onStreamingChange: vi.fn(),
        });

        const response = await service.modifyProjectStreaming(
            makeProjectState(),
            'update the app'
        );

        const fetchCall = (fetch as any).mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);

        expect(requestBody.workspaceId).toBeUndefined();
        expect(response.partialSuccess).toBe(true);
        expect(response.rolledBackFiles).toEqual(['src/Old.tsx']);
        expect(response.changeSummary?.description).toBe('Updated app');
        expect(snapshots[snapshots.length - 1]).toBe('complete');
    });

    it('generateProject sends a JSON request to /generate and returns response', async () => {
        (fetch as any).mockResolvedValue({
            ok: true,
            headers: { get: () => null },
            json: async () => ({ success: true, projectState: { files: { 'src/App.tsx': 'code' } } }),
        });

        const service = createGenerationApiService({
            onStreamSnapshot: vi.fn(),
            onStreamingChange: vi.fn(),
        });

        const result = await service.generateProject('build a todo app');

        expect(fetch).toHaveBeenCalledOnce();
        const [url, options] = (fetch as any).mock.calls[0];
        expect(url).toContain('/generate');
        expect(JSON.parse(options.body).description).toBe('build a todo app');
        expect(result.success).toBe(true);
    });

    it('generateProject omits workspaceId', async () => {
        (fetch as any).mockResolvedValue({
            ok: true,
            headers: { get: () => null },
            json: async () => ({ success: true, projectState: { files: {} } }),
        });

        const service = createGenerationApiService({});

        await service.generateProject('hello');

        const body = JSON.parse((fetch as any).mock.calls[0][1].body);
        expect(body.workspaceId).toBeUndefined();
    });

    it('generateProject throws a user-friendly error on HTTP failure', async () => {
        (fetch as any).mockResolvedValue({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            headers: { get: () => null },
            json: async () => ({ error: 'AI provider error' }),
        });

        const service = createGenerationApiService({});

        await expect(service.generateProject('boom')).rejects.toThrow('AI provider error');
    });

    it('generateProjectStreaming calls /generate-stream and returns streamed result', async () => {
        const { parseSSEStream } = await import('@/utils/sse-parser');

        (fetch as any).mockResolvedValue({
            ok: true,
            headers: { get: () => null },
            body: { getReader: () => ({}) },
        });

        (parseSSEStream as any).mockImplementation(async (_reader: unknown, handlers: Record<string, Function>) => {
            handlers.onComplete?.({ projectState: { files: { 'index.html': '<html/>' } } }, { 'index.html': '<html/>' });
            return { success: true, projectState: { files: { 'index.html': '<html/>' } } };
        });

        const snapshots: string[] = [];
        const service = createGenerationApiService({
            onStreamSnapshot: s => snapshots.push(s.phase),
            onStreamingChange: vi.fn(),
        });

        const result = await service.generateProjectStreaming('simple page');

        const [url] = (fetch as any).mock.calls[0];
        expect(url).toContain('/generate-stream');
        expect(result.success).toBe(true);
        expect(snapshots).toContain('connecting');
        expect(snapshots[snapshots.length - 1]).toBe('complete');
    });

    it('modifyProject sends a JSON request to /modify', async () => {
        (fetch as any).mockResolvedValue({
            ok: true,
            headers: { get: () => null },
            json: async () => ({ success: true, projectState: { files: {} } }),
        });

        const service = createGenerationApiService({});

        const result = await service.modifyProject(makeProjectState(), 'change the color');

        const [url, options] = (fetch as any).mock.calls[0];
        const body = JSON.parse(options.body);
        expect(url).toContain('/modify');
        expect(body.prompt).toBe('change the color');
        expect(body.workspaceId).toBeUndefined();
        expect(result.success).toBe(true);
    });

    it('abortCurrentRequest aborts an active streaming session and calls onStreamingChange(false)', async () => {
        const { parseSSEStream } = await import('@/utils/sse-parser');
        const onStreamingChange = vi.fn();

        // Never resolves until aborted
        (fetch as any).mockResolvedValue({
            ok: true,
            headers: { get: () => null },
            body: { getReader: () => ({}) },
        });

        (parseSSEStream as any).mockImplementation(async (_reader: unknown, _handlers: unknown) => {
            return new Promise<never>((_resolve, reject) => {
                // Simulate abort
                setTimeout(() => reject(Object.assign(new Error('AbortError'), { name: 'AbortError' })), 50);
            });
        });

        const service = createGenerationApiService({
            onStreamSnapshot: vi.fn(),
            onStreamingChange,
        });

        const streamPromise = service.generateProjectStreaming('build something');
        // Give the stream a moment to start
        await new Promise(r => setTimeout(r, 10));
        service.abortCurrentRequest();

        const result = await streamPromise;
        expect(result.success).toBe(false);
        // onStreamingChange should have been called with false after the abort
        expect(onStreamingChange).toHaveBeenCalledWith(false);
    });

    it('dispose calls abortCurrentRequest (no-op when idle)', () => {
        const service = createGenerationApiService({});
        // Should not throw
        expect(() => service.dispose()).not.toThrow();
    });
});
