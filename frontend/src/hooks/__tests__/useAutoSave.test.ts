import type { SerializedProjectState } from '@ai-app-builder/shared/types';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import type { ChatMessage } from '@/components/ChatInterface/ChatInterface';
import { hybridStorageService } from '@/services/storage/HybridStorageService';

import { useAutoSave } from '../useAutoSave';




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

// Mock hybridStorageService used by useAutoSave
vi.mock('@/services/storage/HybridStorageService', () => ({
    hybridStorageService: {
        saveProject: vi.fn(),
        setMetadata: vi.fn(),
    },
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

        expect(hybridStorageService.saveProject).not.toHaveBeenCalled();
    });

    it('should debounce save operations', async () => {
        vi.mocked(hybridStorageService.saveProject).mockResolvedValue(undefined);
        vi.mocked(hybridStorageService.setMetadata).mockResolvedValue(undefined);

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
        expect(hybridStorageService.saveProject).not.toHaveBeenCalled();

        // Advance past debounce delay and run all timers/promises
        await vi.runAllTimersAsync();

        // Should have saved only once
        expect(hybridStorageService.saveProject).toHaveBeenCalledTimes(1);
    });

    it('should save to IndexedDB after debounce delay', async () => {
        vi.mocked(hybridStorageService.saveProject).mockResolvedValue(undefined);
        vi.mocked(hybridStorageService.setMetadata).mockResolvedValue(undefined);

        renderHook(() => useAutoSave(mockProjectState, mockMessages));

        await vi.runAllTimersAsync();

        expect(hybridStorageService.saveProject).toHaveBeenCalledTimes(1);
        expect(hybridStorageService.setMetadata).toHaveBeenCalledWith('lastOpenedProjectId', 'test-project-id');
    });

    it('should set isSaving to true during save operation', async () => {
        let resolveSave: (value: void | PromiseLike<void>) => void = () => { };
        const savePromise = new Promise<void>((resolve) => {
            resolveSave = resolve;
        });
        vi.mocked(hybridStorageService.saveProject).mockReturnValue(savePromise);
        vi.mocked(hybridStorageService.setMetadata).mockResolvedValue(undefined);

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
        vi.mocked(hybridStorageService.saveProject).mockResolvedValue(undefined);
        vi.mocked(hybridStorageService.setMetadata).mockResolvedValue(undefined);

        const { result } = renderHook(() => useAutoSave(mockProjectState, mockMessages));

        expect(result.current.lastSavedAt).toBeNull();

        await vi.runAllTimersAsync();

        expect(result.current.lastSavedAt).toBeInstanceOf(Date);
    });

    it('should handle save errors gracefully', async () => {
        const saveError = new Error('IndexedDB quota exceeded');
        vi.mocked(hybridStorageService.saveProject).mockRejectedValue(saveError);

        const { result } = renderHook(() => useAutoSave(mockProjectState, mockMessages));

        await vi.runAllTimersAsync();

        expect(result.current.saveError).toEqual(saveError);
        expect(result.current.isSaving).toBe(false);
    });

    it('should clear saveError on next successful save', async () => {
        // First save fails
        vi.mocked(hybridStorageService.saveProject).mockRejectedValueOnce(new Error('Save failed'));

        const { result, rerender } = renderHook(
            ({ projectState, messages }) => useAutoSave(projectState, messages),
            {
                initialProps: { projectState: mockProjectState, messages: mockMessages },
            }
        );

        await vi.runAllTimersAsync();

        expect(result.current.saveError).toBeTruthy();

        // Second save succeeds
        vi.mocked(hybridStorageService.saveProject).mockResolvedValue(undefined);
        vi.mocked(hybridStorageService.setMetadata).mockResolvedValue(undefined);

        // Simulate a real update: name and updatedAt both change (updatedAt is a meaningful primitive)
        rerender({ projectState: { ...mockProjectState, name: 'Updated', updatedAt: new Date(Date.now() + 1000).toISOString() }, messages: mockMessages });
        await vi.runAllTimersAsync();

        expect(result.current.saveError).toBeNull();
    });

    it('should use custom debounce delay', async () => {
        vi.mocked(hybridStorageService.saveProject).mockResolvedValue(undefined);
        vi.mocked(hybridStorageService.setMetadata).mockResolvedValue(undefined);

        renderHook(() => useAutoSave(mockProjectState, mockMessages, { debounceMs: 500 }));

        vi.advanceTimersByTime(400);
        expect(hybridStorageService.saveProject).not.toHaveBeenCalled();

        await vi.runAllTimersAsync();

        expect(hybridStorageService.saveProject).toHaveBeenCalledTimes(1);
    });

    it('should cleanup timer on unmount', () => {
        const { unmount } = renderHook(() => useAutoSave(mockProjectState, mockMessages));

        unmount();

        vi.advanceTimersByTime(2000);

        expect(hybridStorageService.saveProject).not.toHaveBeenCalled();
    });

    it('should save with updated messages', async () => {
        vi.mocked(hybridStorageService.saveProject).mockResolvedValue(undefined);
        vi.mocked(hybridStorageService.setMetadata).mockResolvedValue(undefined);

        const updatedMessages: ChatMessage[] = [
            ...mockMessages,
            { id: 'm2', role: 'assistant', content: 'Project created', timestamp: new Date() },
        ];

        renderHook(() => useAutoSave(mockProjectState, updatedMessages));

        await vi.runAllTimersAsync();

        expect(hybridStorageService.saveProject).toHaveBeenCalledWith(
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
        vi.mocked(hybridStorageService.saveProject).mockReturnValue(savePromise);
        vi.mocked(hybridStorageService.setMetadata).mockResolvedValue(undefined);

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

        expect(hybridStorageService.saveProject).toHaveBeenCalledTimes(1);

        // If we get here without React warnings, the fix is working
        // (state updates on unmounted components would cause warnings/errors in tests)
    });

    it('should not update state if unmounted during async save error (StrictMode fix)', async () => {
        // Mock a slow save operation that fails
        let rejectSave: (reason?: any) => void = () => { };
        const savePromise = new Promise<void>((_, reject) => {
            rejectSave = reject;
        });
        vi.mocked(hybridStorageService.saveProject).mockReturnValue(savePromise);

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

        expect(hybridStorageService.saveProject).toHaveBeenCalledTimes(1);

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
        expect(hybridStorageService.saveProject).not.toHaveBeenCalled();
    });
});
