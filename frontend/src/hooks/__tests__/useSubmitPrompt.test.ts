import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useProject, useChatMessages, useGenerationActions } from '../../context';
import { useSubmitPrompt } from '../useSubmitPrompt';

// Mock context hooks
vi.mock('../../context', () => ({
    useProject: vi.fn(),
    useChatMessages: vi.fn(),
    useGenerationActions: vi.fn(),
}));

describe('useSubmitPrompt', () => {
    let mockProject: any;
    let mockChatMessages: any;
    let mockGeneration: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockProject = {
            projectState: null,
            setProjectState: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
        };

        mockChatMessages = {
            addUserMessage: vi.fn(),
            addAssistantMessage: vi.fn(),
        };

        mockGeneration = {
            setIsLoading: vi.fn(),
            setLoadingPhase: vi.fn(),
            clearError: vi.fn(),
            generateProjectStreaming: vi.fn(),
            modifyProject: vi.fn(),
            abortCurrentRequest: vi.fn(),
        };

        vi.mocked(useProject).mockReturnValue(mockProject);
        vi.mocked(useChatMessages).mockReturnValue(mockChatMessages);
        vi.mocked(useGenerationActions).mockReturnValue(mockGeneration);
    });

    it('should submit generation prompt and update state on success', async () => {
        const { result } = renderHook(() => useSubmitPrompt());
        const prompt = 'build a react app';

        mockGeneration.generateProjectStreaming.mockResolvedValue({
            success: true,
            projectState: { name: 'test-app', files: { 'App.tsx': 'code' } },
        });

        await act(async () => {
            await result.current.submitPrompt(prompt);
        });

        expect(mockChatMessages.addUserMessage).toHaveBeenCalledWith(prompt);
        expect(mockGeneration.setIsLoading).toHaveBeenCalledWith(true);
        expect(mockGeneration.setLoadingPhase).toHaveBeenCalledWith('generating');
        expect(mockProject.setProjectState).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'test-app' }),
            false
        );
        expect(mockChatMessages.addAssistantMessage).toHaveBeenCalledWith(
            expect.stringContaining('test-app')
        );
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
        expect(mockChatMessages.addAssistantMessage).toHaveBeenCalledWith(
            expect.stringContaining('Sorry, I couldn\'t generate the project after 3 attempts')
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
        mockProject.projectState = { name: 'old', files: {} };
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
        expect(mockProject.setProjectState).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'old' }),
            true
        );
        expect(mockChatMessages.addAssistantMessage).toHaveBeenCalledWith(
            'Added a button',
            expect.objectContaining({ description: 'Added a button' }),
            undefined
        );
    });

    it('should handle undo and redo', () => {
        const { result } = renderHook(() => useSubmitPrompt());

        act(() => {
            result.current.undo();
        });
        expect(mockProject.undo).toHaveBeenCalled();
        expect(mockChatMessages.addAssistantMessage).toHaveBeenCalledWith(expect.stringContaining('Reverted'));

        act(() => {
            result.current.redo();
        });
        expect(mockProject.redo).toHaveBeenCalled();
        expect(mockChatMessages.addAssistantMessage).toHaveBeenCalledWith(expect.stringContaining('Restored'));
    });
});
