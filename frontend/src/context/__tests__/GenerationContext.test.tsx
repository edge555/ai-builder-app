import { render, screen, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ErrorAggregatorProvider } from '../../context/ErrorAggregatorContext';
import { GenerationProvider } from '../GenerationContext';
import { useGenerationActions, useGenerationState } from '../GenerationContext.context';

type MockSseHandlers = Record<string, (...args: unknown[]) => unknown>;

vi.mock('@/utils/sse-parser', () => ({
    parseSSEStream: vi.fn(),
}));

vi.mock('@/integrations/backend/client', () => ({
    FUNCTIONS_BASE_URL: 'http://localhost/functions',
    SUPABASE_ANON_KEY: 'test-key',
}));

describe('GenerationContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', vi.fn());
    });

    function TestComponent() {
        const state = useGenerationState();
        const actions = useGenerationActions();

        return (
            <div>
                <div data-testid="is-streaming">{state.isStreaming.toString()}</div>
                <div data-testid="phase">{state.streamingState?.phase ?? 'none'}</div>
                <button onClick={() => actions.generateProjectStreaming('test prompt').catch(() => {})}>Start Stream</button>
            </div>
        );
    }

    it('updates provider state during streaming generation', async () => {
        const { parseSSEStream } = await import('@/utils/sse-parser');

        (fetch as any).mockResolvedValue({
            ok: true,
            headers: { get: () => null },
            body: { getReader: () => ({}) },
        });

        (parseSSEStream as any).mockImplementation(async (_reader: unknown, handlers: MockSseHandlers) => {
            await act(async () => {
                handlers.onStart?.();
                handlers.onProgress?.({ length: 100, label: 'Generating UI' });
                handlers.onFile?.({ path: 'App.tsx', content: '...', index: 0, total: 1 }, { 'App.tsx': '...' });
                handlers.onComplete?.({ projectState: { files: { 'App.tsx': '...' } } }, { 'App.tsx': '...' });
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

        await act(async () => {
            screen.getByText('Start Stream').click();
        });

        expect(screen.getByTestId('is-streaming').textContent).toBe('false');
        expect(screen.getByTestId('phase').textContent).toBe('complete');
    });
});
