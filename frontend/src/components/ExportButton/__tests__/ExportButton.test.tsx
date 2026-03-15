import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { useProjectState } from '@/context';

import { ExportButton } from '../ExportButton';


// Mock the context
vi.mock('@/context', () => ({
    useProjectState: vi.fn(),
}));

// Mock the backend client
vi.mock('@/integrations/backend/client', () => ({
    FUNCTIONS_BASE_URL: 'http://localhost/functions',
    SUPABASE_ANON_KEY: 'test-key',
}));

// Mock logger
vi.mock('@/utils/logger', () => ({
    createLogger: () => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    }),
}));

// Mock shared utils
vi.mock('@ai-app-builder/shared/utils', () => ({
    validationError: vi.fn((msg: string) => new Error(msg)),
    serviceError: vi.fn((msg: string) => new Error(msg)),
}));

describe('ExportButton', () => {
    const mockProjectState = {
        id: 'test-project',
        name: 'Test Project',
        description: 'Test Description',
        files: {
            'index.html': '<html></html>',
            'app.js': 'console.log("test");',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentVersionId: 'v1',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();

        // URL mocks are set up in setup.ts via Object.defineProperty
        vi.mocked(global.URL.createObjectURL).mockReturnValue('blob:mock-url');
        vi.mocked(global.URL.revokeObjectURL).mockClear();

        // Spy on document methods (don't replace - React needs real appendChild)
        vi.spyOn(document.body, 'appendChild');
        vi.spyOn(document.body, 'removeChild');
    });

    it('should render export button', () => {
        vi.mocked(useProjectState).mockReturnValue({
            projectState: mockProjectState as any,
        });

        render(<ExportButton />);
        expect(screen.getByText('Export')).toBeInTheDocument();
    });

    it('should be disabled when no project state exists', () => {
        vi.mocked(useProjectState).mockReturnValue({
            projectState: null,
        });

        render(<ExportButton />);
        const button = screen.getByRole('button');
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('title', 'Generate a project first');
    });

    it('should trigger export on click', async () => {
        vi.mocked(useProjectState).mockReturnValue({
            projectState: mockProjectState as any,
        });

        const mockBlob = new Blob(['test'], { type: 'application/zip' });
        (global.fetch as any).mockResolvedValue({
            ok: true,
            blob: () => Promise.resolve(mockBlob),
        });

        render(<ExportButton />);
        const button = screen.getByRole('button');

        fireEvent.click(button);

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                'http://localhost/functions/export',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json',
                    }),
                    body: JSON.stringify({ projectState: mockProjectState }),
                })
            );
        });
    });

    it('should show loading state during export', async () => {
        vi.mocked(useProjectState).mockReturnValue({
            projectState: mockProjectState as any,
        });

        const mockBlob = new Blob(['test'], { type: 'application/zip' });
        (global.fetch as any).mockImplementation(
            () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, blob: () => Promise.resolve(mockBlob) }), 100))
        );

        render(<ExportButton />);
        const button = screen.getByRole('button');

        fireEvent.click(button);

        // Should show loading state
        expect(screen.getByText('Exporting...')).toBeInTheDocument();
        expect(button).toBeDisabled();

        await waitFor(() => {
            expect(screen.queryByText('Exporting...')).not.toBeInTheDocument();
        });
    });

    it('should create download link with correct filename', async () => {
        vi.mocked(useProjectState).mockReturnValue({
            projectState: mockProjectState as any,
        });

        const mockBlob = new Blob(['test'], { type: 'application/zip' });
        (global.fetch as any).mockResolvedValue({
            ok: true,
            blob: () => Promise.resolve(mockBlob),
        });

        render(<ExportButton />);
        const button = screen.getByRole('button');

        fireEvent.click(button);

        await waitFor(() => {
            expect(document.body.appendChild).toHaveBeenCalled();
        });

        // Verify the link element was created with correct properties
        const appendCall = (document.body.appendChild as any).mock.calls.find(
            (call: any[]) => call[0]?.tagName === 'A'
        );
        expect(appendCall).toBeDefined();
        expect(appendCall[0].download).toBe('Test Project.zip');
        expect(appendCall[0].href).toBe('blob:mock-url');
    });

    it('should handle export errors gracefully', async () => {
        vi.mocked(useProjectState).mockReturnValue({
            projectState: mockProjectState as any,
        });

        (global.fetch as any).mockResolvedValue({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
        });

        render(<ExportButton />);
        const button = screen.getByRole('button');

        fireEvent.click(button);

        await waitFor(() => {
            expect(screen.getByText('Retry')).toBeInTheDocument();
        });

        expect(button).toHaveAttribute('data-variant', 'danger');
    });

    it('should show error message in title on failure', async () => {
        vi.mocked(useProjectState).mockReturnValue({
            projectState: mockProjectState as any,
        });

        (global.fetch as any).mockRejectedValue(new Error('Network error'));

        render(<ExportButton />);
        const button = screen.getByRole('button');

        fireEvent.click(button);

        await waitFor(() => {
            expect(button).toHaveAttribute('title', 'Network error');
        });
    });

    it('should cleanup blob URL after download', async () => {
        vi.mocked(useProjectState).mockReturnValue({
            projectState: mockProjectState as any,
        });

        const mockBlob = new Blob(['test'], { type: 'application/zip' });
        (global.fetch as any).mockResolvedValue({
            ok: true,
            blob: () => Promise.resolve(mockBlob),
        });

        render(<ExportButton />);
        const button = screen.getByRole('button');

        fireEvent.click(button);

        await waitFor(() => {
            expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
        });
    });

    it('should have proper ARIA label', () => {
        vi.mocked(useProjectState).mockReturnValue({
            projectState: mockProjectState as any,
        });

        render(<ExportButton />);
        const button = screen.getByLabelText('Export project as ZIP');
        expect(button).toBeInTheDocument();
    });

    it('should handle missing configuration', async () => {
        vi.mocked(useProjectState).mockReturnValue({
            projectState: mockProjectState as any,
        });

        // Re-mock with missing config
        vi.doMock('@/integrations/backend/client', () => ({
            FUNCTIONS_BASE_URL: null,
            SUPABASE_ANON_KEY: null,
        }));

        render(<ExportButton />);
        const button = screen.getByRole('button');

        fireEvent.click(button);

        await waitFor(() => {
            expect(screen.getByText('Retry')).toBeInTheDocument();
        });
    });
});
