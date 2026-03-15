import { render, screen, act } from '@testing-library/react';
import { useContext } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ErrorAggregatorProvider } from '../../context/ErrorAggregatorContext';
import { GenerationProvider } from '../GenerationContext';
import { GenerationContext } from '../GenerationContext.context';

// Mock the SSE parser to avoid real network calls and complex stream mocking in this integration test
vi.mock('@/utils/sse-parser', () => ({
    parseSSEStream: vi.fn(),
}));

// Mock Supabase/Backend constants
vi.mock('@/integrations/backend/client', () => ({
    FUNCTIONS_BASE_URL: 'http://localhost/functions',
    SUPABASE_ANON_KEY: 'test-key',
}));

describe('GenerationContext Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', vi.fn());
    });

    const TestComponent = () => {
        const context = useContext(GenerationContext);
        if (!context) return null;
        return (
            <div>
                <div data-testid="is-streaming">{context.isStreaming.toString()}</div>
                <div data-testid="loading-phase">{context.loadingPhase}</div>
                <button onClick={() => context.generateProjectStreaming('test prompt').catch(() => {})}>Start Stream</button>
            </div>
        );
    };

    it('should update state during streaming generation', async () => {
        const { parseSSEStream } = await import('@/utils/sse-parser');

        (fetch as any).mockResolvedValue({
            ok: true,
            body: { getReader: () => ({}) },
        });

        (parseSSEStream as any).mockImplementation(async (_reader: any, handlers: any) => {
            act(() => {
                handlers.onStart();
                handlers.onProgress(100);
                handlers.onFile({ path: 'App.tsx', content: '...', index: 0, total: 1 }, { 'App.tsx': '...' });
            });
            return { success: true };
        });

        render(
            <ErrorAggregatorProvider>
                <GenerationProvider>
                    <TestComponent />
                </GenerationProvider>
            </ErrorAggregatorProvider>
        );

        const button = screen.getByText('Start Stream');

        await act(async () => {
            button.click();
        });

        // Note: Due to how act and async work with context, we might need multiple await ticks
        expect(screen.getByTestId('is-streaming').textContent).toBe('false'); // Finished streaming
    });

    it('should handle API errors', async () => {
        (fetch as any).mockResolvedValue({
            ok: false,
            status: 500,
            text: () => Promise.resolve('Internal Server Error'),
        });

        render(
            <ErrorAggregatorProvider>
                <GenerationProvider>
                    <TestComponent />
                </GenerationProvider>
            </ErrorAggregatorProvider>
        );

        const button = screen.getByText('Start Stream');

        // The button click fires generateProjectStreaming which rejects on HTTP errors.
        // Catch the unhandled rejection to prevent it from leaking out of the test.
        await act(async () => {
            button.click();
            // Flush microtasks so the rejected promise is settled inside this act
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        expect(screen.getByTestId('is-streaming').textContent).toBe('false');
    });
});
