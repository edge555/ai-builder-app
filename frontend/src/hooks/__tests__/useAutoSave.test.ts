import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAutoSave } from '../useAutoSave';
import { storageService } from '@/services/storage';
import type { SerializedProjectState } from '@/shared';
import type { ChatMessage } from '@/components';

// Mock storage service
vi.mock('@/services/storage', () => ({
    storageService: {
        saveProject: vi.fn(),
        setMetadata: vi.fn(),
    },
    toStoredProject: vi.fn((projectState, messages) => ({
        id: projectState.id,
        name: projectState.name,
        projectState,
        messages,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    })),
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

describe('useAutoSave', () => {
    const mockProjectState: SerializedProjectState = {
        id: 'test-project-id',
        name: 'Test Project',
        files: {
            'index.html': '<html></html>',
        },
    };

    const mockMessages: ChatMessage[] = [
        {
            role: 'user',
            content: 'Create a test app',
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('should not save when projectState is null', async () => {
        renderHook(() => useAutoSave(null, mockMessages));

        vi.advanceTimersByTime(2000);

        expect(storageService.saveProject).not.toHaveBeenCalled();
    });

    it('should debounce save operations', async () => {
        const { rerender } = renderHook(
            ({ projectState, messages }) => useAutoSave(projectState, messages),
            {
                initialProps: { projectState: mockProjectState, messages: mockMessages },
            }
        );

        // Trigger multiple updates quickly
        rerender({ projectState: { ...mockProjectState, name: 'Updated 1' }, messages: mockMessages });
        vi.advanceTimersByTime(500);

        rerender({ projectState: { ...mockProjectState, name: 'Updated 2' }, messages: mockMessages });
        vi.advanceTimersByTime(500);

        rerender({ projectState: { ...mockProjectState, name: 'Updated 3' }, messages: mockMessages });

        // Should not have saved yet
        expect(storageService.saveProject).not.toHaveBeenCalled();

        // Advance past debounce delay
        vi.advanceTimersByTime(1500);

        // Should have saved only once
        await waitFor(() => {
            expect(storageService.saveProject).toHaveBeenCalledTimes(1);
        });
    });

    it('should save to IndexedDB after debounce delay', async () => {
        (storageService.saveProject as any).mockResolvedValue(undefined);
        (storageService.setMetadata as any).mockResolvedValue(undefined);

        renderHook(() => useAutoSave(mockProjectState, mockMessages));

        vi.advanceTimersByTime(1500);

        await waitFor(() => {
            expect(storageService.saveProject).toHaveBeenCalledTimes(1);
            expect(storageService.setMetadata).toHaveBeenCalledWith('lastOpenedProjectId', 'test-project-id');
        });
    });

    it('should set isSaving to true during save operation', async () => {
        (storageService.saveProject as any).mockImplementation(
            () => new Promise((resolve) => setTimeout(resolve, 100))
        );

        const { result } = renderHook(() => useAutoSave(mockProjectState, mockMessages));

        expect(result.current.isSaving).toBe(false);

        vi.advanceTimersByTime(1500);

        await waitFor(() => {
            expect(result.current.isSaving).toBe(true);
        });

        vi.advanceTimersByTime(100);

        await waitFor(() => {
            expect(result.current.isSaving).toBe(false);
        });
    });

    it('should update lastSavedAt on successful save', async () => {
        (storageService.saveProject as any).mockResolvedValue(undefined);
        (storageService.setMetadata as any).mockResolvedValue(undefined);

        const { result } = renderHook(() => useAutoSave(mockProjectState, mockMessages));

        expect(result.current.lastSavedAt).toBeNull();

        vi.advanceTimersByTime(1500);

        await waitFor(() => {
            expect(result.current.lastSavedAt).toBeInstanceOf(Date);
        });
    });

    it('should handle save errors gracefully', async () => {
        const saveError = new Error('IndexedDB quota exceeded');
        (storageService.saveProject as any).mockRejectedValue(saveError);

        const { result } = renderHook(() => useAutoSave(mockProjectState, mockMessages));

        vi.advanceTimersByTime(1500);

        await waitFor(() => {
            expect(result.current.saveError).toEqual(saveError);
            expect(result.current.isSaving).toBe(false);
        });
    });

    it('should clear saveError on next successful save', async () => {
        // First save fails
        (storageService.saveProject as any).mockRejectedValueOnce(new Error('Save failed'));

        const { result, rerender } = renderHook(
            ({ projectState, messages }) => useAutoSave(projectState, messages),
            {
                initialProps: { projectState: mockProjectState, messages: mockMessages },
            }
        );

        vi.advanceTimersByTime(1500);

        await waitFor(() => {
            expect(result.current.saveError).toBeTruthy();
        });

        // Second save succeeds
        (storageService.saveProject as any).mockResolvedValue(undefined);
        (storageService.setMetadata as any).mockResolvedValue(undefined);

        rerender({ projectState: { ...mockProjectState, name: 'Updated' }, messages: mockMessages });
        vi.advanceTimersByTime(1500);

        await waitFor(() => {
            expect(result.current.saveError).toBeNull();
        });
    });

    it('should use custom debounce delay', async () => {
        (storageService.saveProject as any).mockResolvedValue(undefined);
        (storageService.setMetadata as any).mockResolvedValue(undefined);

        renderHook(() => useAutoSave(mockProjectState, mockMessages, { debounceMs: 500 }));

        vi.advanceTimersByTime(400);
        expect(storageService.saveProject).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);

        await waitFor(() => {
            expect(storageService.saveProject).toHaveBeenCalledTimes(1);
        });
    });

    it('should cleanup timer on unmount', () => {
        const { unmount } = renderHook(() => useAutoSave(mockProjectState, mockMessages));

        unmount();

        vi.advanceTimersByTime(2000);

        expect(storageService.saveProject).not.toHaveBeenCalled();
    });

    it('should save with updated messages', async () => {
        (storageService.saveProject as any).mockResolvedValue(undefined);
        (storageService.setMetadata as any).mockResolvedValue(undefined);

        const updatedMessages: ChatMessage[] = [
            ...mockMessages,
            { role: 'assistant', content: 'Project created' },
        ];

        renderHook(() => useAutoSave(mockProjectState, updatedMessages));

        vi.advanceTimersByTime(1500);

        await waitFor(() => {
            expect(storageService.saveProject).toHaveBeenCalledWith(
                expect.objectContaining({
                    messages: updatedMessages,
                })
            );
        });
    });
});
