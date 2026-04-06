import { describe, expect, it, vi, beforeEach } from 'vitest';

import { createStreamSession, createInitialStreamSnapshot } from '../streamingTransport';

vi.mock('@/utils/sse-parser', () => ({
    parseSSEStream: vi.fn(),
}));

vi.mock('@/utils/error-messages', () => ({
    getUserFriendlyErrorMessage: vi.fn(({ originalMessage }: { originalMessage?: string }) => originalMessage ?? 'Unknown error'),
}));

describe('streamingTransport', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('normalizes stream events into snapshots', async () => {
        const { parseSSEStream } = await import('@/utils/sse-parser');
        const snapshots: string[] = [];

        (parseSSEStream as any).mockImplementation(async (_reader: unknown, handlers: Record<string, Function>) => {
            handlers.onStart?.();
            handlers.onProgress?.({ label: 'Generating UI', length: 42 });
            handlers.onFile?.({ path: 'src/App.tsx', content: 'code', index: 0, total: 1 }, { 'src/App.tsx': 'code' });
            handlers.onComplete?.({ projectState: { files: { 'src/App.tsx': 'code' } } }, { 'src/App.tsx': 'code' });
            return { success: true };
        });

        const session = createStreamSession({
            request: async () => ({
                ok: true,
                body: { getReader: () => ({}) },
            } as Response),
            onSnapshot: snapshot => snapshots.push(snapshot.phase),
            cancelMessage: 'cancelled',
            timeoutMessage: 'timed out',
        });

        const result = await session.result;

        expect(result.success).toBe(true);
        expect(snapshots).toContain('connecting');
        expect(snapshots).toContain('generating');
        expect(snapshots).toContain('processing');
        expect(snapshots[snapshots.length - 1]).toBe('complete');
    });

    it('returns cancelMessage when aborted before timeout', async () => {
        const { parseSSEStream } = await import('@/utils/sse-parser');

        (parseSSEStream as any).mockImplementation(() =>
            new Promise<never>((_res, reject) => {
                setTimeout(() => reject(Object.assign(new Error('AbortError'), { name: 'AbortError' })), 50);
            })
        );

        const session = createStreamSession({
            request: async () => ({
                ok: true,
                body: { getReader: () => ({}) },
            } as Response),
            onSnapshot: vi.fn(),
            cancelMessage: 'Request was cancelled',
            timeoutMessage: 'Timed out',
        });

        session.abort();
        const result = await session.result;

        expect(result.success).toBe(false);
        expect((result as any).error).toBe('Request was cancelled');
    });

    it('emits error snapshot on onError SSE event', async () => {
        const { parseSSEStream } = await import('@/utils/sse-parser');
        const phases: string[] = [];

        (parseSSEStream as any).mockImplementation(async (_reader: unknown, handlers: Record<string, Function>) => {
            handlers.onError?.({ error: 'AI error', errorType: 'ai_error', errorCode: 500 });
            return { success: false, error: 'AI error' };
        });

        const session = createStreamSession({
            request: async () => ({
                ok: true,
                body: { getReader: () => ({}) },
            } as Response),
            onSnapshot: snap => phases.push(snap.phase),
            cancelMessage: 'cancelled',
            timeoutMessage: 'timed out',
        });

        await session.result;
        expect(phases).toContain('error');
    });

    it('accumulates warnings in snapshot', async () => {
        const { parseSSEStream } = await import('@/utils/sse-parser');
        const lastSnapshots: import('../types').StreamSnapshot[] = [];

        (parseSSEStream as any).mockImplementation(async (_reader: unknown, handlers: Record<string, Function>) => {
            handlers.onWarning?.({ path: 'src/Foo.tsx', message: 'missing prop', type: 'validation' });
            handlers.onComplete?.({ projectState: { files: {} } }, {});
            return { success: true };
        });

        const session = createStreamSession({
            request: async () => ({
                ok: true,
                body: { getReader: () => ({}) },
            } as Response),
            onSnapshot: snap => lastSnapshots.push({ ...snap }),
            cancelMessage: 'cancelled',
            timeoutMessage: 'timed out',
        });

        await session.result;

        const withWarning = lastSnapshots.find(s => s.warnings.length > 0);
        expect(withWarning).toBeDefined();
        expect(withWarning!.warnings[0].message).toBe('missing prop');
    });

    it('throws when HTTP response is not ok', async () => {
        const session = createStreamSession({
            request: async () => ({
                ok: false,
                status: 503,
                statusText: 'Service Unavailable',
                text: async () => 'Service down',
                body: null,
            } as unknown as Response),
            onSnapshot: vi.fn(),
            cancelMessage: 'cancelled',
            timeoutMessage: 'timed out',
        });

        await expect(session.result).rejects.toThrow('Service down');
    });

    it('throws when response body is null (no reader)', async () => {
        const { parseSSEStream } = await import('@/utils/sse-parser');
        (parseSSEStream as any).mockResolvedValue({ success: true });

        const session = createStreamSession({
            request: async () => ({
                ok: true,
                body: null,
            } as unknown as Response),
            onSnapshot: vi.fn(),
            cancelMessage: 'cancelled',
            timeoutMessage: 'timed out',
        });

        await expect(session.result).rejects.toThrow('No response body');
    });

    it('applies mapResult to transform the base result', async () => {
        const { parseSSEStream } = await import('@/utils/sse-parser');

        (parseSSEStream as any).mockImplementation(async (_reader: unknown, handlers: Record<string, Function>) => {
            handlers.onComplete?.({ diffs: [{ path: 'x', type: 'added' }] }, {});
            return { success: true, projectState: { files: {} } };
        });

        const session = createStreamSession({
            request: async () => ({
                ok: true,
                body: { getReader: () => ({}) },
            } as Response),
            onSnapshot: vi.fn(),
            cancelMessage: 'cancelled',
            timeoutMessage: 'timed out',
            mapResult: (base, complete) => ({
                ...base,
                diffs: complete?.diffs as any,
            }),
        });

        const result = await session.result as any;
        expect(result.diffs).toEqual([{ path: 'x', type: 'added' }]);
    });

    it('createInitialStreamSnapshot returns a connecting snapshot with empty state', () => {
        const snap = createInitialStreamSnapshot();
        expect(snap.phase).toBe('connecting');
        expect(snap.files).toEqual({});
        expect(snap.warnings).toEqual([]);
        expect(snap.error).toBeNull();
        expect(snap.summary).toBeNull();
    });
});
