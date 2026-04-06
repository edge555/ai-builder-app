import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useProjectState, useProjectActions, useChatMessages, useGenerationActions, useToastActions } from '../../context';
import { hybridStorageService } from '../../services/storage/HybridStorageService';
import { useSubmitPrompt } from '../useSubmitPrompt';

// Mock context hooks
vi.mock('../../context', () => ({
    useProjectState: vi.fn(),
    useProjectActions: vi.fn(),
    useChatMessages: vi.fn(),
    useGenerationActions: vi.fn(),
    useToastActions: vi.fn(),
}));

// Mock storage service
vi.mock('../../services/storage', () => ({
    toStoredProject: vi.fn().mockReturnValue({}),
}));

vi.mock('../../services/storage/HybridStorageService', () => ({
    hybridStorageService: {
        getUniqueProjectName: vi.fn().mockImplementation(async (name: string) => name),
        saveProject: vi.fn().mockResolvedValue(undefined),
        setMetadata: vi.fn().mockResolvedValue(undefined),
    },
}));

describe('useSubmitPrompt', () => {
    let mockProjectState: any;
    let mockProjectActions: any;
    let mockChatMessages: any;
    let mockGeneration: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockProjectState = {
            projectState: null,
        };

        mockProjectActions = {
            setProjectState: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
        };

        mockChatMessages = {
            messages: [],
            addUserMessage: vi.fn().mockReturnValue({ id: 'user-1', role: 'user', content: '' }),
            addAssistantMessage: vi.fn().mockReturnValue({ id: 'asst-1', role: 'assistant', content: '' }),
            addErrorMessage: vi.fn(),
        };

        mockGeneration = {
            setIsLoading: vi.fn(),
            setLoadingPhase: vi.fn(),
            clearError: vi.fn(),
            generateProjectStreaming: vi.fn(),
            modifyProject: vi.fn(),
            abortCurrentRequest: vi.fn(),
        };

        vi.mocked(useProjectState).mockReturnValue(mockProjectState);
        vi.mocked(useProjectActions).mockReturnValue(mockProjectActions);
        vi.mocked(useChatMessages).mockReturnValue(mockChatMessages);
        vi.mocked(useGenerationActions).mockReturnValue(mockGeneration);
        vi.mocked(useToastActions).mockReturnValue({ addToast: vi.fn(), dismissToast: vi.fn(), clearAll: vi.fn() });
    });

    it('should submit generation prompt and update state on success', async () => {
        const { result } = renderHook(() => useSubmitPrompt());
        const prompt = 'build a react app';

        mockGeneration.generateProjectStreaming.mockResolvedValue({
            success: true,
            projectState: { id: 'test-1', name: 'test-app', files: { 'App.tsx': 'code' } },
        });

        await act(async () => {
            await result.current.submitPrompt(prompt);
        });

        expect(mockChatMessages.addUserMessage).toHaveBeenCalledWith(prompt);
        expect(mockGeneration.setIsLoading).toHaveBeenCalledWith(true);
        expect(mockGeneration.setLoadingPhase).toHaveBeenCalledWith('generating');
        expect(hybridStorageService.getUniqueProjectName).toHaveBeenCalledWith('test-app');
        expect(mockProjectActions.setProjectState).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'test-app' }),
            false
        );
        expect(mockChatMessages.addAssistantMessage).toHaveBeenCalledWith(
            expect.stringContaining('test-app'),
            undefined,
            undefined,
            expect.any(Number)
        );
        expect(hybridStorageService.saveProject).toHaveBeenCalledTimes(1);
        expect(hybridStorageService.setMetadata).toHaveBeenCalledWith('lastOpenedProjectId', 'test-1');
        expect(mockGeneration.setIsLoading).toHaveBeenCalledWith(false);
    });

    it('should retry generation up to MAX_API_RETRIES times', async () => {
        const { result } = renderHook(() => useSubmitPrompt());
        const prompt = 'build a react app';

        mockGeneration.generateProjectStreaming.mockResolvedValue({
            success: false,
            error: 'AI Error',
        });

        await act(async () => {
            await result.current.submitPrompt(prompt);
        });

        // 3 retries (total 3 attempts)
        expect(mockGeneration.generateProjectStreaming).toHaveBeenCalledTimes(3);
        expect(mockChatMessages.addAssistantMessage).toHaveBeenCalledWith(
            expect.stringContaining('Retrying generation (2/3)')
        );
        expect(mockChatMessages.addErrorMessage).toHaveBeenCalledWith(
            expect.stringContaining('Sorry, I couldn\'t generate the project after 3 attempts'),
            expect.any(String)
        );
    });

    it('should stop retrying if request was cancelled', async () => {
        const { result } = renderHook(() => useSubmitPrompt());

        mockGeneration.generateProjectStreaming.mockResolvedValue({
            success: false,
            error: 'Request was cancelled',
        });

        await act(async () => {
            await result.current.submitPrompt('wont finish');
        });

        expect(mockGeneration.generateProjectStreaming).toHaveBeenCalledTimes(1);
        expect(mockChatMessages.addAssistantMessage).not.toHaveBeenCalledWith(
            expect.stringContaining('Retry')
        );
    });

    it('should modify existing project', async () => {
        mockProjectState.projectState = { name: 'old', files: {} };
        const { result } = renderHook(() => useSubmitPrompt());
        const prompt = 'add a button';

        mockGeneration.modifyProject.mockResolvedValue({
            success: true,
            projectState: { name: 'old', files: { 'Button.tsx': 'code' } },
            changeSummary: { description: 'Added a button' },
        });

        await act(async () => {
            await result.current.submitPrompt(prompt);
        });

        expect(mockGeneration.setLoadingPhase).toHaveBeenCalledWith('modifying');
        expect(mockProjectActions.setProjectState).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'old' }),
            true
        );
        expect(mockChatMessages.addAssistantMessage).toHaveBeenCalledWith(
            'Added a button',
            expect.objectContaining({ description: 'Added a button' }),
            undefined,
            expect.any(Number)
        );
    });

    it('should handle undo and redo', () => {
        const { result } = renderHook(() => useSubmitPrompt());

        act(() => {
            result.current.undo();
        });
        expect(mockProjectActions.undo).toHaveBeenCalled();
        expect(mockChatMessages.addAssistantMessage).toHaveBeenCalledWith(expect.stringContaining('Reverted'));

        act(() => {
            result.current.redo();
        });
        expect(mockProjectActions.redo).toHaveBeenCalled();
        expect(mockChatMessages.addAssistantMessage).toHaveBeenCalledWith(expect.stringContaining('Restored'));
    });

    it('should abort in-flight request when new submit arrives', async () => {
        const { result } = renderHook(() => useSubmitPrompt());

        // First call: hang indefinitely
        let resolveFirst: any;
        mockGeneration.generateProjectStreaming.mockImplementationOnce(
            () => new Promise(resolve => { resolveFirst = resolve; })
        );

        // Start first submission (don't await — it's in-flight)
        let firstPromise: Promise<void>;
        act(() => {
            firstPromise = result.current.submitPrompt('first prompt');
        });

        // Second call: resolve immediately
        mockGeneration.generateProjectStreaming.mockResolvedValueOnce({
            success: true,
            projectState: { id: 'test-2', name: 'second-app', files: { 'App.tsx': 'code' } },
        });

        // Submit second request while first is in-flight
        await act(async () => {
            await result.current.submitPrompt('second prompt');
        });

        // abortCurrentRequest should have been called to cancel the first
        expect(mockGeneration.abortCurrentRequest).toHaveBeenCalled();

        // Resolve the first to let it finish cleanly
        resolveFirst?.({ success: false, error: 'Request was cancelled' });
        await act(async () => {
            await firstPromise!;
        });
    });

    it('should save a unique generated name when the original collides', async () => {
        const { result } = renderHook(() => useSubmitPrompt());
        const prompt = 'build a calculator';

        vi.mocked(hybridStorageService.getUniqueProjectName).mockResolvedValue('Bright Calc Lab');
        mockGeneration.generateProjectStreaming.mockResolvedValue({
            success: true,
            projectState: { id: 'test-3', name: 'Quick Calc Studio', files: { 'App.tsx': 'code' } },
        });

        await act(async () => {
            await result.current.submitPrompt(prompt);
        });

        expect(mockProjectActions.setProjectState).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Bright Calc Lab' }),
            false
        );
        expect(mockChatMessages.addAssistantMessage).toHaveBeenCalledWith(
            expect.stringContaining('Bright Calc Lab'),
            undefined,
            undefined,
            expect.any(Number)
        );
    });
});
