import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ChatMessage } from '../components/ChatInterface';
import type { ChangeSummary, FileDiff } from '@/shared';

/**
 * Chat messages context value.
 */
export interface ChatMessagesContextValue {
  messages: ChatMessage[];
  addUserMessage: (content: string) => ChatMessage;
  addAssistantMessage: (content: string, changeSummary?: ChangeSummary, diffs?: FileDiff[]) => ChatMessage;
  clearMessages: () => void;
}

const ChatMessagesContext = createContext<ChatMessagesContextValue | null>(null);

/**
 * Generates a unique ID for messages using crypto.randomUUID().
 */
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Provider for chat messages management.
 * Manages message history.
 */
export function ChatMessagesProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  /**
   * Adds a user message to the chat history.
   */
  const addUserMessage = useCallback((content: string): ChatMessage => {
    const message: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, message]);
    return message;
  }, []);

  /**
   * Adds an assistant message to the chat history.
   */
  const addAssistantMessage = useCallback((content: string, changeSummary?: ChangeSummary, diffs?: FileDiff[]): ChatMessage => {
    const message: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content,
      timestamp: new Date(),
      changeSummary,
      diffs,
    };
    setMessages((prev) => [...prev, message]);
    return message;
  }, []);

  /**
   * Clears all messages from the chat history.
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const value = useMemo<ChatMessagesContextValue>(() => ({
    messages,
    addUserMessage,
    addAssistantMessage,
    clearMessages,
  }), [messages, addUserMessage, addAssistantMessage, clearMessages]);

  return (
    <ChatMessagesContext.Provider value={value}>
      {children}
    </ChatMessagesContext.Provider>
  );
}

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
