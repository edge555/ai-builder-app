import { describe, expect, it, vi } from 'vitest';

import { parseSSEStream } from '../sse-parser';

describe('parseSSEStream', () => {
    it('should parse simple SSE events', async () => {
        const mockEvents = [
            'event: start\ndata: {}\n\n',
            'event: file\ndata: {"path": "test.txt", "content": "hello"}\n\n',
            'event: complete\ndata: {"projectState": {}, "version": {}}\n\n',
        ];

        let chunkIndex = 0;
        const reader = {
            read: vi.fn().mockImplementation(async () => {
                if (chunkIndex < mockEvents.length) {
                    return {
                        done: false,
                        value: new TextEncoder().encode(mockEvents[chunkIndex++]),
                    };
                }
                return { done: true, value: undefined };
            }),
        } as unknown as ReadableStreamDefaultReader<Uint8Array>;

        const handlers = {
            onStart: vi.fn(),
            onFile: vi.fn(),
            onComplete: vi.fn(),
        };

        const result = await parseSSEStream(reader, handlers);

        expect(result.success).toBe(true);
        expect(handlers.onStart).toHaveBeenCalled();
        expect(handlers.onFile).toHaveBeenCalledWith(
            { path: 'test.txt', content: 'hello' },
            { 'test.txt': 'hello' }
        );
        expect(handlers.onComplete).toHaveBeenCalled();
    });

    it('should handle split chunks', async () => {
        const mockChunks = [
            'event: file\ndata: {"path": "te',
            'st.txt", "content": "hello"}\n\n',
        ];

        let chunkIndex = 0;
        const reader = {
            read: vi.fn().mockImplementation(async () => {
                if (chunkIndex < mockChunks.length) {
                    return {
                        done: false,
                        value: new TextEncoder().encode(mockChunks[chunkIndex++]),
                    };
                }
                return { done: true, value: undefined };
            }),
        } as unknown as ReadableStreamDefaultReader<Uint8Array>;

        const handlers = {
            onFile: vi.fn(),
        };

        await parseSSEStream(reader, handlers);

        expect(handlers.onFile).toHaveBeenCalledWith(
            { path: 'test.txt', content: 'hello' },
            { 'test.txt': 'hello' }
        );
    });

    it('should handle heartbeats', async () => {
        const mockEvents = [
            ': heartbeat\n',
            'event: start\ndata: {}\n\n',
        ];

        let chunkIndex = 0;
        const reader = {
            read: vi.fn().mockImplementation(async () => {
                if (chunkIndex < mockEvents.length) {
                    return {
                        done: false,
                        value: new TextEncoder().encode(mockEvents[chunkIndex++]),
                    };
                }
                return { done: true, value: undefined };
            }),
        } as unknown as ReadableStreamDefaultReader<Uint8Array>;

        const handlers = {
            onHeartbeat: vi.fn(),
            onStart: vi.fn(),
        };

        await parseSSEStream(reader, handlers);

        expect(handlers.onHeartbeat).toHaveBeenCalled();
        expect(handlers.onStart).toHaveBeenCalled();
    });

    it('should handle errors', async () => {
        const mockEvents = [
            'event: error\ndata: {"error": "Something went wrong"}\n\n',
        ];

        const reader = {
            read: vi.fn()
                .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode(mockEvents[0]),
                })
                .mockResolvedValueOnce({ done: true, value: undefined }),
        } as unknown as ReadableStreamDefaultReader<Uint8Array>;

        const handlers = {
            onError: vi.fn(),
        };

        const result = await parseSSEStream(reader, handlers);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Something went wrong');
        expect(handlers.onError).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'Something went wrong' })
        );
    });
});
