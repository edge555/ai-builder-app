import React, { useState, useRef, useEffect, forwardRef, lazy, Suspense, memo } from 'react';
import type { ChangeSummary, FileDiff } from '@/shared';
import { ErrorMessage, classifyError } from '../ErrorMessage';
import { PromptSuggestions } from '../PromptSuggestions';
import { StreamingIndicator } from '../StreamingIndicator';
import { MarkdownRenderer } from '../MarkdownRenderer/MarkdownRenderer';
import { FileChangeSummary } from '../FileChangeSummary/FileChangeSummary';
import { QuickActions } from '../QuickActions/QuickActions';
import { CollapsibleMessage } from './CollapsibleMessage';
import { CollapseAllButton } from './CollapseAllButton';
import { useCollapsibleMessages } from '@/hooks/useCollapsibleMessages';
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
  /** Callback to abort current request */
  onAbort?: () => void;
  /** Callback when a file change indicator is clicked */
  onFileClick?: (filePath: string) => void;
}

/**
 * Chat interface component for interacting with the AI App Builder.
 * Displays message history and provides input for new prompts.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */
const ChatInterfaceComponent = function ChatInterface({
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
  onAbort,
  onFileClick,
}: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState('');
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Collapsible messages state
  const {
    isCollapsed,
    canCollapse,
    toggle,
    collapseAll,
    expandAll,
    allCollapsed,
    anyCollapsed,
    hasCollapsibleMessages,
  } = useCollapsibleMessages(messages);

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
    // Submit on Ctrl+Enter (Windows/Linux) or Meta+Enter (Mac)
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
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
        {/* Collapse All button - only show when there are collapsible messages */}
        {hasCollapsibleMessages && (
          <CollapseAllButton
            allCollapsed={allCollapsed}
            anyCollapsed={anyCollapsed}
            onCollapseAll={collapseAll}
            onExpandAll={expandAll}
          />
        )}
        {messages.map((message) => (
          <CollapsibleMessage
            key={message.id}
            message={message}
            isCollapsed={isCollapsed(message.id)}
            canCollapse={canCollapse(message.id)}
            onToggle={() => toggle(message.id)}
          >
            <MessageItemWithRef message={message} onFileClick={onFileClick} />
          </CollapsibleMessage>
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

      {/* Contextual suggestions above input when project exists */}
      {messages.length > 0 && !isLoading && (
        <QuickActions
          suggestions={suggestions}
          onSelect={handleSuggestionSelect}
          disabled={isLoading}
          error={error}
        />
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
        {isLoading && onAbort && (
          <button
            type="button"
            className="chat-abort-button ui-button"
            data-variant="secondary"
            onClick={onAbort}
            aria-label="Cancel request"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
            Cancel
          </button>
        )}
      </form>
    </div>
  );
};

/**
 * Custom comparator for ChatInterface memoization.
 * Compares messages array by checking each message's id to avoid unnecessary re-renders.
 */
function areChatPropsEqual(
  prevProps: Readonly<ChatInterfaceProps>,
  nextProps: Readonly<ChatInterfaceProps>
): boolean {
  // Compare primitives
  if (
    prevProps.isLoading !== nextProps.isLoading ||
    prevProps.loadingPhase !== nextProps.loadingPhase ||
    prevProps.error !== nextProps.error ||
    prevProps.isStreaming !== nextProps.isStreaming
  ) {
    return false;
  }

  // Compare callbacks (reference equality for stable callbacks)
  if (
    prevProps.onSubmitPrompt !== nextProps.onSubmitPrompt ||
    prevProps.onClearError !== nextProps.onClearError ||
    prevProps.onRetry !== nextProps.onRetry ||
    prevProps.onAbort !== nextProps.onAbort ||
    prevProps.onFileClick !== nextProps.onFileClick
  ) {
    return false;
  }

  // Compare messages array (shallow comparison by ids and timestamps)
  if (prevProps.messages.length !== nextProps.messages.length) {
    return false;
  }

  for (let i = 0; i < prevProps.messages.length; i++) {
    const prevMsg = prevProps.messages[i];
    const nextMsg = nextProps.messages[i];

    // Compare by id and content (sufficient for detecting changes)
    if (
      prevMsg.id !== nextMsg.id ||
      prevMsg.content !== nextMsg.content ||
      prevMsg.role !== nextMsg.role
    ) {
      return false;
    }
  }

  // Compare suggestions array
  const prevSuggestions = prevProps.suggestions || [];
  const nextSuggestions = nextProps.suggestions || [];

  if (prevSuggestions.length !== nextSuggestions.length) {
    return false;
  }

  // Compare streamingState (shallow)
  const prevStreaming = prevProps.streamingState;
  const nextStreaming = nextProps.streamingState;

  if (prevStreaming !== nextStreaming) {
    if (!prevStreaming || !nextStreaming) {
      return false; // One is null, other is not
    }

    // Compare key streaming properties
    if (
      prevStreaming.phase !== nextStreaming.phase ||
      prevStreaming.filesReceived !== nextStreaming.filesReceived ||
      prevStreaming.totalFiles !== nextStreaming.totalFiles ||
      prevStreaming.textLength !== nextStreaming.textLength
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Memoized ChatInterface - avoids re-rendering when props haven't changed.
 * Particularly important for large message lists.
 */
export const ChatInterface = memo(ChatInterfaceComponent, areChatPropsEqual);

/**
 * Props for the MessageItem component.
 */
interface MessageItemProps {
  message: ChatMessage;
  onFileClick?: (filePath: string) => void;
}

/**
 * Renders a single chat message with optional change summary.
 * Accepts refs to avoid React dev warnings when something upstream attaches refs.
 */
const MessageItemWithRef = React.memo(
  forwardRef<HTMLDivElement, MessageItemProps>(function MessageItemWithRef({ message, onFileClick }, ref) {
    const isUser = message.role === 'user';

    return (
      <div ref={ref} className={`chat-message ${isUser ? 'chat-message-user' : 'chat-message-assistant'}`}>
        <div className="chat-message-header">
          <span className="chat-message-role">{isUser ? 'You' : 'Assistant'}</span>
          <span className="chat-message-time">
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="chat-message-content">
          {isUser ? (
            message.content
          ) : (
            <MarkdownRenderer content={message.content} />
          )}
        </div>
        {message.changeSummary && (
          <FileChangeSummary
            changeSummary={message.changeSummary}
            diffs={message.diffs}
            onFileClick={onFileClick}
          />
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
