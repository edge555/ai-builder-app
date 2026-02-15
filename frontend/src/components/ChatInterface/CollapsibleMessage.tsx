import { type ReactNode } from 'react';

import type { ChatMessage } from './ChatInterface';
import './CollapsibleMessage.css';

interface CollapsibleMessageProps {
    /** The message to display */
    message: ChatMessage;
    /** Whether the message is currently collapsed */
    isCollapsed: boolean;
    /** Whether this message can be collapsed */
    canCollapse: boolean;
    /** Callback when toggle button is clicked */
    onToggle: () => void;
    /** The message content to display when expanded */
    children: ReactNode;
}

/**
 * Generates a summary text for a collapsed message.
 */
function getMessageSummary(message: ChatMessage): string {
    const isUser = message.role === 'user';

    if (isUser) {
        // For user messages, show first ~50 chars
        const truncated = message.content.slice(0, 50);
        return truncated.length < message.content.length ? `${truncated}...` : truncated;
    }

    // For assistant messages with changeSummary, show file count
    if (message.changeSummary) {
        const totalFiles =
            message.changeSummary.filesAdded +
            message.changeSummary.filesModified +
            message.changeSummary.filesDeleted;
        return `Modified ${totalFiles} file${totalFiles !== 1 ? 's' : ''}`;
    }

    // For assistant messages without changeSummary, show first ~50 chars
    const truncated = message.content.slice(0, 50);
    return truncated.length < message.content.length ? `${truncated}...` : truncated;
}

/**
 * Wrapper component for collapsible chat messages.
 * Shows a compact summary when collapsed, full content when expanded.
 */
export function CollapsibleMessage({
    message,
    isCollapsed,
    canCollapse,
    onToggle,
    children,
}: CollapsibleMessageProps) {
    const isUser = message.role === 'user';
    const summary = getMessageSummary(message);

    if (isCollapsed) {
        return (
            <div
                className="collapsible-message collapsible-message-collapsed"
                onClick={onToggle}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onToggle();
                    }
                }}
                aria-expanded="false"
                aria-label={`Expand message from ${isUser ? 'you' : 'assistant'}`}
            >
                <div className="collapsible-message-summary">
                    <span className={`collapsible-message-role ${isUser ? 'role-user' : 'role-assistant'}`}>
                        {isUser ? 'You' : 'Assistant'}
                    </span>
                    <span className="collapsible-message-summary-text">{summary}</span>
                    <span className="collapsible-message-time">
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button
                        className="collapsible-message-toggle"
                        aria-label="Expand message"
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggle();
                        }}
                    >
                        <svg
                            className="collapsible-message-chevron"
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M6 4L10 8L6 12"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="collapsible-message collapsible-message-expanded">
            {canCollapse && (
                <button
                    className="collapsible-message-toggle collapsible-message-toggle-expanded"
                    onClick={onToggle}
                    aria-label="Collapse message"
                    aria-expanded="true"
                >
                    <svg
                        className="collapsible-message-chevron"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M4 6L8 10L12 6"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </button>
            )}
            <div className="collapsible-message-content">{children}</div>
        </div>
    );
}
