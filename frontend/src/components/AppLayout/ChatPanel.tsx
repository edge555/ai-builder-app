import { useState, useCallback, useMemo } from 'react';

import { useChatMessages, useGenerationState, useGenerationActions, useProject } from '@/context';
import { initialSuggestions, analyzeProjectForSuggestions } from '@/data/prompt-suggestions';
import { useSubmitPrompt } from '@/hooks/useSubmitPrompt';

import { ChatInterface } from '../ChatInterface';

/**
 * Main chat panel component that uses the chat context.
 */
export interface ChatPanelProps {
  onFileClick?: (filePath: string) => void;
}

export function ChatPanel({ onFileClick }: ChatPanelProps) {
  const { messages } = useChatMessages();
  const { isLoading, loadingPhase, error, streamingState, isStreaming } = useGenerationState();
  const { clearError, abortCurrentRequest } = useGenerationActions();
  const { projectState } = useProject();
  const { submitPrompt } = useSubmitPrompt();
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);

  // Generate context-aware suggestions
  const suggestions = useMemo(() => {
    if (!projectState) {
      return initialSuggestions;
    }
    return analyzeProjectForSuggestions(projectState.files);
  }, [projectState]);

  const handleSubmit = useCallback(async (prompt: string) => {
    setLastPrompt(prompt);
    await submitPrompt(prompt);
  }, [submitPrompt]);

  const handleRetry = useCallback(() => {
    if (lastPrompt) {
      clearError();
      submitPrompt(lastPrompt);
    }
  }, [lastPrompt, clearError, submitPrompt]);

  return (
    <ChatInterface
      messages={messages}
      isLoading={isLoading}
      loadingPhase={loadingPhase}
      onSubmitPrompt={handleSubmit}
      error={error}
      onClearError={clearError}
      onRetry={handleRetry}
      suggestions={suggestions}
      streamingState={streamingState}
      isStreaming={isStreaming}
      onAbort={abortCurrentRequest}
      onFileClick={onFileClick}
    />
  );
}
