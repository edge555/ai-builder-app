import React, { useState, useRef, useEffect, forwardRef } from 'react';
import type { ChangeSummary, FileDiff } from '@/shared';
import { ErrorMessage, classifyError } from '../ErrorMessage';
import { DiffViewer } from '../DiffViewer';
import { PromptSuggestions } from '../PromptSuggestions';
import { StreamingIndicator } from '../StreamingIndicator';
import type { PromptSuggestion } from '@/data/prompt-suggestions';
import type { StreamingState } from '@/context';
import './ChatInterface.css';

/**
 * Represents a single chat message in the conversation.
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  changeSummary?: ChangeSummary;
  diffs?: FileDiff[];
  isError?: boolean;
}

/**
 * Loading phase for progress indication.
 */
export type LoadingPhase = 'idle' | 'generating' | 'modifying' | 'validating' | 'processing';

/**
 * Props for the ChatInterface component.
 */
export interface ChatInterfaceProps {
  /** Callback when user submits a prompt */
  onSubmitPrompt: (prompt: string) => Promise<void>;
  /** Array of chat messages to display */
  messages: ChatMessage[];
  /** Whether an API call is in progress */
  isLoading: boolean;
  /** Current loading phase for progress indication */
  loadingPhase?: LoadingPhase;
  /** Current error message */
  error?: string | null;
  /** Callback to clear error */
  onClearError?: () => void;
  /** Callback to retry last action */
  onRetry?: () => void;
  /** Smart prompt suggestions */
  suggestions?: PromptSuggestion[];
  /** Streaming state for real-time generation updates */
  streamingState?: StreamingState | null;
  /** Whether streaming generation is active */
  isStreaming?: boolean;
}

/**
 * Chat interface component for interacting with the AI App Builder.
 * Displays message history and provides input for new prompts.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */
export function ChatInterface({
  onSubmitPrompt,
  messages,
  isLoading,
  loadingPhase = 'processing',
  error,
  onClearError,
  onRetry,
  suggestions = [],
  streamingState,
  isStreaming = false,
}: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState('');
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = inputValue.trim();
    if (!trimmedInput || isLoading) return;

    setLastPrompt(trimmedInput);
    setInputValue('');
    await onSubmitPrompt(trimmedInput);
  };

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else if (lastPrompt) {
      onSubmitPrompt(lastPrompt);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSuggestionSelect = (prompt: string) => {
    setInputValue(prompt);
    // Focus the input so user can modify if needed
    inputRef.current?.focus();
  };

  return (
    <div className="chat-interface" role="region" aria-label="Chat interface">
      <div className="chat-messages" role="log" aria-live="polite">
        {messages.length === 0 && (
          <div className="chat-empty-state">
            <div className="chat-empty-icon" aria-hidden="true">✨</div>
            <div className="chat-empty-content">
              <p className="chat-empty-title">What would you like to build?</p>
              <p className="chat-empty-description">Describe your app idea and I'll generate it for you in seconds.</p>
              {suggestions.length > 0 && (
                <div className="chat-empty-suggestions">
                  <p className="chat-suggestions-label">Try one of these:</p>
                  <PromptSuggestions
                    suggestions={suggestions}
                    onSelect={handleSuggestionSelect}
                    variant="cards"
                    disabled={isLoading}
                  />
                </div>
              )}
            </div>
          </div>
        )}
        {messages.map((message) => (
          <MessageItemWithRef key={message.id} message={message} />
        ))}
        {isStreaming && streamingState && (
          <StreamingIndicator state={streamingState} />
        )}
        {isLoading && !isStreaming && <LoadingIndicator phase={loadingPhase} />}
        {error && !isLoading && (
          <div className="chat-error-container">
            <ErrorMessage
              message={error}
              type={classifyError(error)}
              recoverable={true}
              onRetry={handleRetry}
              onDismiss={onClearError}
            />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Show contextual suggestions above input when project exists */}
      {messages.length > 0 && suggestions.length > 0 && !isLoading && (
        <div className="chat-contextual-suggestions">
          <PromptSuggestions
            suggestions={suggestions.slice(0, 4)}
            onSelect={handleSuggestionSelect}
            variant="chips"
            disabled={isLoading}
          />
        </div>
      )}

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          className="chat-input ui-textarea"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe your app or request a modification..."
          disabled={isLoading}
          rows={3}
          aria-label="Chat input"
        />
        <button
          type="submit"
          className="chat-submit-button ui-button"
          data-variant="primary"
          disabled={isLoading || !inputValue.trim()}
          aria-label="Send message"
        >
          {isLoading ? (
            <span className="export-button-spinner"></span>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          )}
        </button>
      </form>
    </div>
  );
}


/**
 * Props for the MessageItem component.
 */
interface MessageItemProps {
  message: ChatMessage;
}

/**
 * Renders a single chat message with optional change summary.
 * Accepts refs to avoid React dev warnings when something upstream attaches refs.
 */
const MessageItemWithRef = React.memo(
  forwardRef<HTMLDivElement, MessageItemProps>(function MessageItemWithRef({ message }, ref) {
    const isUser = message.role === 'user';

    return (
      <div ref={ref} className={`chat-message ${isUser ? 'chat-message-user' : 'chat-message-assistant'}`}>
        <div className="chat-message-header">
          <span className="chat-message-role">{isUser ? 'You' : 'Assistant'}</span>
          <span className="chat-message-time">
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="chat-message-content">{message.content}</div>
        {message.changeSummary && <ChangeSummaryDisplay summary={message.changeSummary} />}
        {message.diffs && message.diffs.length > 0 && (
          <div className="message-diff-viewer">
            <DiffViewer diffs={message.diffs} showActions={false} />
          </div>
        )}
      </div>
    );
  })
);

MessageItemWithRef.displayName = 'MessageItem';

/**
 * Props for the ChangeSummaryDisplay component.
 */
interface ChangeSummaryDisplayProps {
  summary: ChangeSummary;
}

/**
 * Displays a summary of changes made by the AI.
 */
const ChangeSummaryDisplay = React.memo(function ChangeSummaryDisplay({ summary }: ChangeSummaryDisplayProps) {
  return (
    <div className="change-summary" role="region" aria-label="Change summary">
      <div className="change-summary-header">Changes Made</div>
      <div className="change-summary-stats">
        {summary.filesAdded > 0 && (
          <span className="change-stat change-stat-added">
            +{summary.filesAdded} file{summary.filesAdded !== 1 ? 's' : ''} added
          </span>
        )}
        {summary.filesModified > 0 && (
          <span className="change-stat change-stat-modified">
            ~{summary.filesModified} file{summary.filesModified !== 1 ? 's' : ''} modified
          </span>
        )}
        {summary.filesDeleted > 0 && (
          <span className="change-stat change-stat-deleted">
            -{summary.filesDeleted} file{summary.filesDeleted !== 1 ? 's' : ''} deleted
          </span>
        )}
      </div>
      <div className="change-summary-lines">
        <span className="lines-added">+{summary.linesAdded} lines</span>
        <span className="lines-deleted">-{summary.linesDeleted} lines</span>
      </div>
      {summary.affectedFiles.length > 0 && (
        <details className="change-summary-files">
          <summary>Affected files ({summary.affectedFiles.length})</summary>
          <ul>
            {summary.affectedFiles.map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
});

/**
 * detailed loading steps for different phases to simulate complex processing.
 */
const LOADING_STEPS: Record<LoadingPhase, string[]> = {
  idle: ['Ready'],
  generating: [
    'Analyzing requirements...',
    'Designing application architecture...',
    'Scaffolding component tree...',
    'Generating data models...',
    'Constructing API routes...',
    'Writing business logic...',
    'Optimizing build configuration...',
    'Finalizing project structure...',
  ],
  modifying: [
    'Analyzing current project state...',
    'Reading source files...',
    'Calculating dependency graph...',
    'Designing requested changes...',
    'Applying code transformations...',
    'Updating type definitions...',
    'Verifying integrity...',
    'Rebuilding affected modules...',
  ],
  validating: [
    'Running static analysis...',
    'Checking type safety...',
    'Verifying imports...',
    'Ensuring compilation success...',
  ],
  processing: ['Processing...'],
};

/**
 * Props for the LoadingIndicator component.
 */
interface LoadingIndicatorProps {
  phase?: LoadingPhase;
}

/**
 * Loading indicator shown during API calls.
 * Shows cycling messages to simulate complex background processing.
 * 
 * Requirements: 8.2
 */
const LoadingIndicator = forwardRef<HTMLDivElement, LoadingIndicatorProps>(function LoadingIndicator(
  { phase = 'processing' },
  ref
) {
  const [messageIndex, setMessageIndex] = useState(0);

  // Reset index when phase changes
  useEffect(() => {
    setMessageIndex(0);
  }, [phase]);

  // Cycle through messages
  useEffect(() => {
    const steps = LOADING_STEPS[phase];
    if (!steps || steps.length <= 1) return;

    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % steps.length);
    }, 2000); // Change message every 2 seconds

    return () => clearInterval(interval);
  }, [phase]);

  const steps = LOADING_STEPS[phase] || ['Processing...'];
  const currentMessage = steps[messageIndex % steps.length];

  return (
    <div ref={ref} className="chat-loading" role="status" aria-label={currentMessage}>
      <div className="chat-loading-content">
        <div className="chat-loading-spinner">
          <div className="chat-loading-spinner-ring"></div>
        </div>
        <div className="chat-loading-info">
          <span className="chat-loading-text">{currentMessage}</span>
        </div>
      </div>
      <div className="chat-loading-progress">
        <div
          className="chat-loading-progress-bar"
          style={{
            animationDuration: `${Math.max(2, steps.length * 2)}s`
          }}
        ></div>
      </div>
    </div>
  );
});

LoadingIndicator.displayName = 'LoadingIndicator';

export default ChatInterface;
