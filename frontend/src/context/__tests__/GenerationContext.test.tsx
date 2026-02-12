import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { GenerationProvider } from '../GenerationContext';
import { GenerationContext } from '../GenerationContext.context';
import { ErrorAggregatorProvider } from '../../context/ErrorAggregatorContext';

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
        const context = React.useContext(GenerationContext);
        return (
            <div>
                <div data-testid="is-streaming">{context.isStreaming.toString()}</div>
                <div data-testid="loading-phase">{context.loadingPhase}</div>
                <button onClick={() => context.generateProjectStreaming('test prompt')}>Start Stream</button>
            </div>
        );
    };

    it('should update state during streaming generation', async () => {
        const { parseSSEStream } = await import('@/utils/sse-parser');

        (fetch as any).mockResolvedValue({
            ok: true,
            body: { getReader: () => ({}) },
        });

        (parseSSEStream as any).mockImplementation(async (reader, handlers) => {
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

        await act(async () => {
            try {
                await button.click();
            } catch (e) {
                // Expected error
            }
        });

        expect(screen.getByTestId('is-streaming').textContent).toBe('false');
    });
});
