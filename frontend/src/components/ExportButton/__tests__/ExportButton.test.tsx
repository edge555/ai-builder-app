import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExportButton } from '../ExportButton';
import { useProject } from '@/context';

// Mock the context
vi.mock('@/context', () => ({
    useProject: vi.fn(),
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

describe('ExportButton', () => {
    const mockProjectState = {
        name: 'Test Project',
        files: {
            'index.html': '<html></html>',
            'app.js': 'console.log("test");',
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();

        // Mock URL.createObjectURL and revokeObjectURL
        global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        global.URL.revokeObjectURL = vi.fn();

        // Mock document methods
        document.body.appendChild = vi.fn();
        document.body.removeChild = vi.fn();
    });

    it('should render export button', () => {
        vi.mocked(useProject).mockReturnValue({
            projectState: mockProjectState,
            setProjectState: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
        });

        render(<ExportButton />);
        expect(screen.getByText('Export')).toBeInTheDocument();
    });

    it('should be disabled when no project state exists', () => {
        vi.mocked(useProject).mockReturnValue({
            projectState: null,
            setProjectState: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
        });

        render(<ExportButton />);
        const button = screen.getByRole('button');
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('title', 'Generate a project first');
    });

    it('should trigger export on click', async () => {
        vi.mocked(useProject).mockReturnValue({
            projectState: mockProjectState,
            setProjectState: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
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
        vi.mocked(useProject).mockReturnValue({
            projectState: mockProjectState,
            setProjectState: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
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
        vi.mocked(useProject).mockReturnValue({
            projectState: mockProjectState,
            setProjectState: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
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
        const appendCall = (document.body.appendChild as any).mock.calls[0][0];
        expect(appendCall.tagName).toBe('A');
        expect(appendCall.download).toBe('Test Project.zip');
        expect(appendCall.href).toBe('blob:mock-url');
    });

    it('should handle export errors gracefully', async () => {
        vi.mocked(useProject).mockReturnValue({
            projectState: mockProjectState,
            setProjectState: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
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
        vi.mocked(useProject).mockReturnValue({
            projectState: mockProjectState,
            setProjectState: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
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
        vi.mocked(useProject).mockReturnValue({
            projectState: mockProjectState,
            setProjectState: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
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
        vi.mocked(useProject).mockReturnValue({
            projectState: mockProjectState,
            setProjectState: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
        });

        render(<ExportButton />);
        const button = screen.getByLabelText('Export project as ZIP');
        expect(button).toBeInTheDocument();
    });

    it('should handle missing configuration', async () => {
        vi.mocked(useProject).mockReturnValue({
            projectState: mockProjectState,
            setProjectState: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
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
