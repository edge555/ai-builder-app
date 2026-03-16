import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ImportLocalProjectsDialog } from '../ImportLocalProjectsDialog';

vi.mock('@/services/storage', () => ({
    storageService: {
        getAllProjectMetadata: vi.fn().mockResolvedValue([]),
        setMetadata: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('@/services/cloud/CloudStorageService', () => ({
    cloudStorageService: {
        saveProject: vi.fn().mockResolvedValue(undefined),
        saveChatMessages: vi.fn().mockResolvedValue(undefined),
    },
}));

const noop = vi.fn();

describe('ImportLocalProjectsDialog', () => {
    beforeEach(() => vi.clearAllMocks());

    it('sets aria-hidden="true" when closed', () => {
        const { container } = render(
            <ImportLocalProjectsDialog isOpen={false} onClose={noop} onImported={noop} />
        );
        const dialog = container.querySelector('dialog.import-dialog');
        expect(dialog).not.toBeNull();
        expect(dialog).toHaveAttribute('aria-hidden', 'true');
    });

    it('sets aria-hidden="false" when open with projects', async () => {
        const { storageService } = await import('@/services/storage');
        vi.mocked(storageService.getAllProjectMetadata).mockResolvedValue([
            { id: '1', name: 'My Project', fileCount: 3, createdAt: '', updatedAt: '' } as any,
        ]);

        const { container } = render(
            <ImportLocalProjectsDialog isOpen={true} onClose={noop} onImported={noop} />
        );

        // Dialog renders after async project load resolves
        await waitFor(() => {
            const dialog = container.querySelector('dialog.import-dialog');
            expect(dialog).not.toBeNull();
            expect(dialog).toHaveAttribute('aria-hidden', 'false');
        });
    });

    it('dialog is not in the accessible heading tree when closed', () => {
        render(
            <div>
                <h1>Login</h1>
                <ImportLocalProjectsDialog isOpen={false} onClose={noop} onImported={noop} />
            </div>
        );
        // The import dialog heading should not be accessible when closed
        const dialog = document.querySelector('dialog.import-dialog');
        expect(dialog).toHaveAttribute('aria-hidden', 'true');
        // The visible heading is from the login page, not the import dialog
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Login');
    });
});
