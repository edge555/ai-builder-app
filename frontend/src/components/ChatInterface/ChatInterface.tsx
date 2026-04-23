import type { ChangeSummary, FileDiff, ImageAttachment } from '@ai-app-builder/shared/types';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useState, useRef, useEffect, memo } from 'react';

import type { StreamingState } from '@/context';
import type { PromptSuggestion } from '@/data/prompt-suggestions';
import { useCollapsibleMessages } from '@/hooks/useCollapsibleMessages';

import { ErrorMessage, classifyError } from '../ErrorMessage';
import { PromptSuggestions } from '../PromptSuggestions';
import { QuickActions } from '../QuickActions/QuickActions';
import { StreamingIndicator } from '../StreamingIndicator';

import { ChatInput } from './ChatInput';
import { MessageItemWithRef } from './MessageItem';
import { CollapseAllButton } from './CollapseAllButton';
import { CollapsibleMessage } from './CollapsibleMessage';
import { LoadingIndicator, type LoadingPhase } from './LoadingIndicator';
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
  /** Prompt to re-submit when the user retries an error message */
  retryPrompt?: string;
  /** How long the generation/modification took in milliseconds */
  durationMs?: number;
}

/**
 * Threshold for enabling message virtualization.
 * Message lists with more items than this will use virtual scrolling.
 */
const VIRTUALIZATION_THRESHOLD = 20;

/**
 * Estimated height of a chat message (in pixels).
 * Used for virtual scrolling calculations.
 */
const ESTIMATED_MESSAGE_HEIGHT = 150;

/**
 * Props for the ChatInterface component.
 */
export interface ChatInterfaceProps {
  /** Callback when user submits a prompt (with optional image attachments) */
  onSubmitPrompt: (prompt: string, attachments?: ImageAttachment[]) => Promise<void>;
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
  /** Placeholder text for the chat input */
  inputPlaceholder?: string;
  /** Current project files for generation summary cards */
  projectFiles?: Record<string, string>;
  /** True when the current generation involves many files (>10), used to set accurate slow-warning */
  isComplexGeneration?: boolean;
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
  inputPlaceholder,
  projectFiles,
  isComplexGeneration = false,
}: ChatInterfaceProps) {
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Determine if we should use virtualization
  const shouldVirtualize = messages.length > VIRTUALIZATION_THRESHOLD;

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

  // Setup virtualizer for large message lists
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => messagesContainerRef.current,
    estimateSize: () => ESTIMATED_MESSAGE_HEIGHT,
    overscan: 5,
    enabled: shouldVirtualize,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (shouldVirtualize) {
      // For virtualized lists, scroll to the last item
      if (messages.length > 0) {
        virtualizer.scrollToIndex(messages.length - 1, {
          align: 'end',
          behavior: 'smooth',
        });
      }
    } else {
      // For non-virtualized lists, use the old scroll method
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, shouldVirtualize, virtualizer]);

  const handleSubmit = async (prompt: string, attachments?: ImageAttachment[]) => {
    setLastPrompt(prompt);
    await onSubmitPrompt(prompt, attachments);
  };

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else if (lastPrompt) {
      onSubmitPrompt(lastPrompt);
    }
  };

  const handleSuggestionSelect = (prompt: string) => {
    // Directly submit the suggestion
    handleSubmit(prompt);
  };

  return (
    <div className="chat-interface" role="region" aria-label="Chat interface">
      <div
        ref={messagesContainerRef}
        className="chat-messages"
        role="log"
        aria-live="polite"
        style={shouldVirtualize ? { overflow: 'auto' } : undefined}
      >
        {messages.length === 0 && (
          <div className="chat-empty-state">
            <div className="chat-empty-icon" aria-hidden="true">✨</div>
            <div className="chat-empty-content">
              <p className="chat-empty-title">What would you like to build?</p>
              <p className="chat-empty-description">Describe your app idea and I'll build it for you.</p>
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
              <p className="chat-empty-tip">You can refine your app by describing changes after the first build.</p>
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
        {shouldVirtualize ? (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const message = messages[virtualItem.index];
              return (
                <div
                  key={message.id}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <CollapsibleMessage
                    message={message}
                    messageId={message.id}
                    isCollapsed={isCollapsed(message.id)}
                    canCollapse={canCollapse(message.id)}
                    onToggle={toggle}
                  >
                    <MessageItemWithRef message={message} projectFiles={projectFiles} onFileClick={onFileClick} onRetryPrompt={onSubmitPrompt} />
                  </CollapsibleMessage>
                </div>
              );
            })}
          </div>
        ) : (
          messages.map((message) => (
            <CollapsibleMessage
              key={message.id}
              message={message}
              messageId={message.id}
              isCollapsed={isCollapsed(message.id)}
              canCollapse={canCollapse(message.id)}
              onToggle={toggle}
            >
              <MessageItemWithRef message={message} onFileClick={onFileClick} onRetryPrompt={onSubmitPrompt} />
            </CollapsibleMessage>
          ))
        )}
        {isStreaming && streamingState && (
          <StreamingIndicator state={streamingState} />
        )}
        {isLoading && !isStreaming && <LoadingIndicator phase={loadingPhase} isComplexGeneration={isComplexGeneration} />}
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
        {!shouldVirtualize && <div ref={messagesEndRef} />}
      </div>

      {/* Contextual suggestions above input when project exists */}
      {messages.length > 0 && !isLoading && (
        <QuickActions
          suggestions={suggestions}
          onSelect={(prompt) => {
            // QuickActions will be used directly with ChatInput
            handleSubmit(prompt);
          }}
          disabled={isLoading}
          error={error}
        />
      )}

      <ChatInput
        onSubmit={handleSubmit}
        disabled={isLoading}
        showAbort={isLoading && Boolean(onAbort)}
        onAbort={onAbort}
        placeholder={inputPlaceholder}
      />
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



export default ChatInterface;
