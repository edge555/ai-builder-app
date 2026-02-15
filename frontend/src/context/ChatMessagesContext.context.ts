import { createContext, useContext } from 'react';
import type { ChatMessage } from '../components/ChatInterface';
import type { ChangeSummary, FileDiff } from '@ai-app-builder/shared/types';

/**
 * Chat messages context value.
 */
export interface ChatMessagesContextValue {
    messages: ChatMessage[];
    addUserMessage: (content: string) => ChatMessage;
    addAssistantMessage: (content: string, changeSummary?: ChangeSummary, diffs?: FileDiff[]) => ChatMessage;
    clearMessages: () => void;
}

export const ChatMessagesContext = createContext<ChatMessagesContextValue | null>(null);

/**
 * Hook to access the chat messages context.
 * Must be used within a ChatMessagesProvider.
 */
export function useChatMessages(): ChatMessagesContextValue {
    const context = useContext(ChatMessagesContext);
    if (!context) {
        throw new Error('useChatMessages must be used within a ChatMessagesProvider');
    }
    return context;
}
