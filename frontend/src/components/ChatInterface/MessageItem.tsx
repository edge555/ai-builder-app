import { memo, forwardRef } from 'react';

import { ErrorMessage, classifyError } from '../ErrorMessage';
import { FileChangeSummary } from '../FileChangeSummary/FileChangeSummary';
import { MarkdownRenderer } from '../MarkdownRenderer/MarkdownRenderer';
import { GenerationSummaryCard } from './GenerationSummaryCard';
import type { ChatMessage } from './ChatInterface';

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

interface MessageItemProps {
  message: ChatMessage;
  /** Current project files for the summary card */
  projectFiles?: Record<string, string>;
  onFileClick?: (filePath: string) => void;
  onRetryPrompt?: (prompt: string) => void;
}

/**
 * Renders a single chat message with optional change summary.
 * Accepts refs to avoid React dev warnings when something upstream attaches refs.
 */
export const MessageItemWithRef = memo(
  forwardRef<HTMLDivElement, MessageItemProps>(function MessageItemWithRef({ message, projectFiles, onFileClick, onRetryPrompt }, ref) {
    const isUser = message.role === 'user';

    return (
      <div ref={ref} className={`chat-message ${isUser ? 'chat-message-user' : 'chat-message-assistant'}`}>
        <div className="chat-message-header">
          <span className="chat-message-role">{isUser ? 'You' : 'Assistant'}</span>
          <span className="chat-message-time">
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {!isUser && message.durationMs !== undefined && (
            <span className="chat-message-duration">{formatDuration(message.durationMs)}</span>
          )}
        </div>
        <div className="chat-message-content">
          {isUser ? (
            message.content
          ) : message.isError ? (
            <ErrorMessage
              message={message.content}
              type={classifyError(message.content)}
              recoverable={!!message.retryPrompt}
              onRetry={message.retryPrompt && onRetryPrompt
                ? () => onRetryPrompt(message.retryPrompt!)
                : undefined
              }
            />
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
        {!isUser && !message.isError && message.changeSummary && message.changeSummary.filesAdded > 3 && projectFiles && (
          <GenerationSummaryCard
            files={projectFiles}
            changeSummary={message.changeSummary}
          />
        )}
      </div>
    );
  })
);

MessageItemWithRef.displayName = 'MessageItem';
