
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../generate-stream/route';
import { createStreamingProjectGenerator } from '../../../lib/core/streaming-generator';

// Mock the services
vi.mock('../../../lib/core/streaming-generator', () => ({
    createStreamingProjectGenerator: vi.fn(),
}));

vi.mock('../../../lib/security', () => ({
    applyRateLimit: vi.fn(async () => ({ blocked: null, headers: {} })),
    RateLimitTier: {
        HIGH_COST: 'HIGH_COST',
        MEDIUM_COST: 'MEDIUM_COST',
        LOW_COST: 'LOW_COST',
        CONFIG: 'CONFIG',
    },
}));

describe('POST /api/generate-stream', () => {
    let mockGenerator: any;

    beforeEach(() => {
        vi.useFakeTimers();
        mockGenerator = {
            generateProjectStreaming: vi.fn().mockImplementation(async (desc, callbacks) => {
                // Simulate some async work
                callbacks.onStart?.();
                await new Promise(resolve => setTimeout(resolve, 100));
                callbacks.onProgress?.(10);

                // Check signal periodically like the real generator would
                if (callbacks.signal?.aborted) {
                    return { success: false, error: 'Cancelled' };
                }

                await new Promise(resolve => setTimeout(resolve, 100));

                if (callbacks.signal?.aborted) {
                    return { success: false, error: 'Cancelled' };
                }

                callbacks.onComplete?.({
                    projectState: { id: 'p1', name: 'test' },
                    version: { id: 'v1' }
                });
                return { success: true };
            }),
        };

        vi.mocked(createStreamingProjectGenerator).mockReturnValue(mockGenerator);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('should handle client disconnect (abort signal)', async () => {
        const controller = new AbortController();
        const request = new NextRequest('http://localhost/api/generate-stream', {
            method: 'POST',
            headers: { origin: 'http://localhost:8080' },
            body: JSON.stringify({ description: 'A test project' }),
            signal: controller.signal,
        });

        const response = await POST(request);
        const reader = response.body?.getReader();

        // Read start event
        await reader?.read();

        // Abort the request simulating client disconnect
        controller.abort();

        // Advance timers to trigger potential timeouts/intervals
        await vi.advanceTimersByTimeAsync(1000);

        // The stream should be closed
        const { done } = await reader!.read();
        expect(done).toBe(true);

        // Verify generator received the signal
        expect(mockGenerator.generateProjectStreaming).toHaveBeenCalled();

        // Verify the signal passed to generator is aborted
        const callArgs = mockGenerator.generateProjectStreaming.mock.calls[0];
        const callbacks = callArgs[1];
        expect(callbacks.signal.aborted).toBe(true);
    });

    it('should clear heartbeat interval on abort', async () => {
        const controller = new AbortController();
        const request = new NextRequest('http://localhost/api/generate-stream', {
            method: 'POST',
            headers: { origin: 'http://localhost:8080' },
            body: JSON.stringify({ description: 'Test' }),
            signal: controller.signal,
        });

        const response = await POST(request);
        const reader = response.body?.getReader();

        // Start reading
        await reader?.read();

        // Spy on clearInterval
        const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

        // Abort
        controller.abort();
        await vi.advanceTimersByTimeAsync(100);

        expect(clearIntervalSpy).toHaveBeenCalled();
    });
});
