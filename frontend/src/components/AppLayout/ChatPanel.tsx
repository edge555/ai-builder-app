import type { ImageAttachment } from '@ai-app-builder/shared/types';
import { useState, useCallback, useMemo } from 'react';

import { useChatMessages, useGenerationState, useGenerationActions, useProjectState } from '@/context';
import { initialSuggestions, analyzeProjectForSuggestions } from '@/data/prompt-suggestions';
import { useSubmitPrompt } from '@/hooks/useSubmitPrompt';

import { ChatInterface } from '../ChatInterface';
import { ContextualTip } from '../ContextualTip/ContextualTip';

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
  const { projectState } = useProjectState();
  const { submitPrompt } = useSubmitPrompt();
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);

  // Generate context-aware suggestions
  const suggestions = useMemo(() => {
    if (!projectState) {
      return initialSuggestions;
    }
    return analyzeProjectForSuggestions(projectState.files);
  }, [projectState]);

  const handleSubmit = useCallback(async (prompt: string, attachments?: ImageAttachment[]) => {
    setLastPrompt(prompt);
    await submitPrompt(prompt, attachments);
  }, [submitPrompt]);

  const handleRetry = useCallback(() => {
    if (lastPrompt) {
      clearError();
      submitPrompt(lastPrompt);
    }
  }, [lastPrompt, clearError, submitPrompt]);

  const hasProject = Boolean(projectState);
  const hasGeneratedOnce = messages.some(m => m.role === 'assistant' && !m.isError);
  const inputPlaceholder = hasProject
    ? 'Ask me to modify your app...'
    : 'Describe your app or request a modification...';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
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
        inputPlaceholder={inputPlaceholder}
        projectFiles={projectState?.files}
      />
      {hasGeneratedOnce && !isLoading && (
        <div style={{ padding: '0 12px 8px' }}>
          <ContextualTip
            tipKey="post-first-gen"
            message="Try asking me to change colors, add features, rename things, or fix issues. Use Ctrl+Z to undo."
          />
        </div>
      )}
    </div>
  );
}
