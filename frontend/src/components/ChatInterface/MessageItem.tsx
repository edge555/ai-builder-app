import { memo, forwardRef } from 'react';

import { FileChangeSummary } from '../FileChangeSummary/FileChangeSummary';
import { MarkdownRenderer } from '../MarkdownRenderer/MarkdownRenderer';
import type { ChatMessage } from './ChatInterface';

interface MessageItemProps {
  message: ChatMessage;
  onFileClick?: (filePath: string) => void;
}

/**
 * Renders a single chat message with optional change summary.
 * Accepts refs to avoid React dev warnings when something upstream attaches refs.
 */
export const MessageItemWithRef = memo(
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
