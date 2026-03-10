import type { ChangeSummary, FileDiff } from '@ai-app-builder/shared/types';
import { useState, useCallback, useMemo, type ReactNode } from 'react';

import type { ChatMessage } from '../components/ChatInterface/ChatInterface';

import { ChatMessagesContext, type ChatMessagesContextValue } from './ChatMessagesContext.context';

/**
 * Generates a unique ID for messages using crypto.randomUUID().
 */
function generateId(): string {
  return crypto.randomUUID();
}

export interface ChatMessagesProviderProps {
  children: ReactNode;
  /** Optional initial messages for restoration */
  initialMessages?: ChatMessage[];
}

/**
 * Provider for chat messages management.
 * Manages message history.
 */
export function ChatMessagesProvider({ children, initialMessages }: ChatMessagesProviderProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? []);

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
   * Adds an error assistant message with an optional retry prompt.
   */
  const addErrorMessage = useCallback((content: string, retryPrompt?: string): ChatMessage => {
    const message: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content,
      timestamp: new Date(),
      isError: true,
      retryPrompt,
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
    addErrorMessage,
    clearMessages,
  }), [messages, addUserMessage, addAssistantMessage, addErrorMessage, clearMessages]);

  return (
    <ChatMessagesContext.Provider value={value}>
      {children}
    </ChatMessagesContext.Provider>
  );
}


