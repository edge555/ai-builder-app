import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoSave } from '../useAutoSave';
import { storageService } from '@/services/storage';
import type { SerializedProjectState } from '@ai-app-builder/shared/types';
import type { ChatMessage } from '@/components/ChatInterface/ChatInterface';

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
        description: 'Test Description',
        files: {
            'index.html': '<html></html>',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentVersionId: 'v1',
    };

    const mockMessages: ChatMessage[] = [
        {
            id: 'm1',
            role: 'user',
            content: 'Create a test app',
            timestamp: new Date(),
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
        (storageService.saveProject as any).mockResolvedValue(undefined);
        (storageService.setMetadata as any).mockResolvedValue(undefined);

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

        // Advance past debounce delay and run all timers/promises
        await vi.runAllTimersAsync();

        // Should have saved only once
        expect(storageService.saveProject).toHaveBeenCalledTimes(1);
    });

    it('should save to IndexedDB after debounce delay', async () => {
        (storageService.saveProject as any).mockResolvedValue(undefined);
        (storageService.setMetadata as any).mockResolvedValue(undefined);

        renderHook(() => useAutoSave(mockProjectState, mockMessages));

        await vi.runAllTimersAsync();

        expect(storageService.saveProject).toHaveBeenCalledTimes(1);
        expect(storageService.setMetadata).toHaveBeenCalledWith('lastOpenedProjectId', 'test-project-id');
    });

    it('should set isSaving to true during save operation', async () => {
        let resolveSave: (value: void | PromiseLike<void>) => void = () => { };
        const savePromise = new Promise<void>((resolve) => {
            resolveSave = resolve;
        });
        (storageService.saveProject as any).mockReturnValue(savePromise);
        (storageService.setMetadata as any).mockResolvedValue(undefined);

        const { result } = renderHook(() => useAutoSave(mockProjectState, mockMessages));

        expect(result.current.isSaving).toBe(false);

        // Advance past debounce delay and wait for state updates
        await act(async () => {
            vi.advanceTimersByTime(1500);
            await Promise.resolve(); // Let microtasks flush
        });

        expect(result.current.isSaving).toBe(true);

        // Complete the save
        await act(async () => {
            resolveSave!();
            await Promise.resolve(); // Let microtasks flush
        });

        expect(result.current.isSaving).toBe(false);
    });

    it('should update lastSavedAt on successful save', async () => {
        (storageService.saveProject as any).mockResolvedValue(undefined);
        (storageService.setMetadata as any).mockResolvedValue(undefined);

        const { result } = renderHook(() => useAutoSave(mockProjectState, mockMessages));

        expect(result.current.lastSavedAt).toBeNull();

        await vi.runAllTimersAsync();

        expect(result.current.lastSavedAt).toBeInstanceOf(Date);
    });

    it('should handle save errors gracefully', async () => {
        const saveError = new Error('IndexedDB quota exceeded');
        (storageService.saveProject as any).mockRejectedValue(saveError);

        const { result } = renderHook(() => useAutoSave(mockProjectState, mockMessages));

        await vi.runAllTimersAsync();

        expect(result.current.saveError).toEqual(saveError);
        expect(result.current.isSaving).toBe(false);
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

        await vi.runAllTimersAsync();

        expect(result.current.saveError).toBeTruthy();

        // Second save succeeds
        (storageService.saveProject as any).mockResolvedValue(undefined);
        (storageService.setMetadata as any).mockResolvedValue(undefined);

        rerender({ projectState: { ...mockProjectState, name: 'Updated' }, messages: mockMessages });
        await vi.runAllTimersAsync();

        expect(result.current.saveError).toBeNull();
    });

    it('should use custom debounce delay', async () => {
        (storageService.saveProject as any).mockResolvedValue(undefined);
        (storageService.setMetadata as any).mockResolvedValue(undefined);

        renderHook(() => useAutoSave(mockProjectState, mockMessages, { debounceMs: 500 }));

        vi.advanceTimersByTime(400);
        expect(storageService.saveProject).not.toHaveBeenCalled();

        await vi.runAllTimersAsync();

        expect(storageService.saveProject).toHaveBeenCalledTimes(1);
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
            { id: 'm2', role: 'assistant', content: 'Project created', timestamp: new Date() },
        ];

        renderHook(() => useAutoSave(mockProjectState, updatedMessages));

        await vi.runAllTimersAsync();

        expect(storageService.saveProject).toHaveBeenCalledWith(
            expect.objectContaining({
                messages: updatedMessages,
            })
        );
    });

    it('should not update state if unmounted during async save (StrictMode fix)', async () => {
        // Mock a slow save operation
        let resolveSave: (value: void | PromiseLike<void>) => void = () => { };
        const savePromise = new Promise<void>((resolve) => {
            resolveSave = resolve;
        });
        (storageService.saveProject as any).mockReturnValue(savePromise);
        (storageService.setMetadata as any).mockResolvedValue(undefined);

        const { result, unmount } = renderHook(() => useAutoSave(mockProjectState, mockMessages));

        // Start the save operation
        await act(async () => {
            vi.advanceTimersByTime(1500);
            await Promise.resolve(); // Let microtasks flush
        });

        // isSaving should be true
        expect(result.current.isSaving).toBe(true);

        // Unmount while save is in progress
        unmount();

        // Complete the save operation (should not trigger state updates)
        resolveSave!();
        await Promise.resolve(); // Let microtasks flush

        expect(storageService.saveProject).toHaveBeenCalledTimes(1);

        // If we get here without React warnings, the fix is working
        // (state updates on unmounted components would cause warnings/errors in tests)
    });

    it('should not update state if unmounted during async save error (StrictMode fix)', async () => {
        // Mock a slow save operation that fails
        let rejectSave: (reason?: any) => void = () => { };
        const savePromise = new Promise<void>((_, reject) => {
            rejectSave = reject;
        });
        (storageService.saveProject as any).mockReturnValue(savePromise);

        const { result, unmount } = renderHook(() => useAutoSave(mockProjectState, mockMessages));

        // Start the save operation
        await act(async () => {
            vi.advanceTimersByTime(1500);
            await Promise.resolve(); // Let microtasks flush
        });

        // isSaving should be true
        expect(result.current.isSaving).toBe(true);

        // Unmount while save is in progress
        unmount();

        // Reject the save operation (should not trigger state updates)
        rejectSave!(new Error('Save failed'));
        await Promise.resolve(); // Let microtasks flush

        expect(storageService.saveProject).toHaveBeenCalledTimes(1);

        // If we get here without React warnings, the fix is working
        // (state updates on unmounted components would cause warnings/errors in tests)
    });

    it('should cancel pending save if unmounted before timer fires', () => {
        const { unmount } = renderHook(() => useAutoSave(mockProjectState, mockMessages));

        // Advance time but not enough for debounce
        vi.advanceTimersByTime(1000);

        // Unmount before timer fires
        unmount();

        // Advance past debounce delay
        vi.advanceTimersByTime(1000);

        // Should not have saved
        expect(storageService.saveProject).not.toHaveBeenCalled();
    });
});
