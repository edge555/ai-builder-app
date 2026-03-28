import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatMessage } from '../ChatInterface';

// jsdom doesn't implement scrollIntoView — add stub
Element.prototype.scrollIntoView = vi.fn();

// Mock all heavy sub-dependencies before importing ChatInterface
vi.mock('@tanstack/react-virtual', () => ({
    useVirtualizer: () => ({
        getVirtualItems: () => [],
        getTotalSize: () => 0,
        measureElement: null,
        scrollToIndex: vi.fn(),
    }),
}));

vi.mock('@/hooks/useCollapsibleMessages', () => ({
    useCollapsibleMessages: () => ({
        isCollapsed: () => false,
        canCollapse: () => false,
        toggle: vi.fn(),
        collapseAll: vi.fn(),
        expandAll: vi.fn(),
        allCollapsed: false,
        anyCollapsed: false,
        hasCollapsibleMessages: false,
    }),
}));

vi.mock('../MessageItem', () => ({
    MessageItemWithRef: ({ message }: any) => (
        <div data-testid={`message-${message.id}`} data-role={message.role}>
            {message.content}
        </div>
    ),
}));

vi.mock('../CollapseAllButton', () => ({
    CollapseAllButton: ({ onCollapseAll, onExpandAll }: any) => (
        <div data-testid="collapse-all-button">
            <button onClick={onCollapseAll}>Collapse All</button>
            <button onClick={onExpandAll}>Expand All</button>
        </div>
    ),
}));

vi.mock('../CollapsibleMessage', () => ({
    CollapsibleMessage: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('../LoadingIndicator', () => ({
    LoadingIndicator: ({ phase }: any) => <div data-testid="loading-indicator" data-phase={phase} />,
}));

vi.mock('@/components/StreamingIndicator', () => ({
    StreamingIndicator: ({ state }: any) => <div data-testid="streaming-indicator" data-phase={state.phase} />,
}));

vi.mock('../ChatInput', () => ({
    ChatInput: ({ onSubmit, disabled, showAbort, onAbort, placeholder }: any) => (
        <div data-testid="chat-input">
            <input
                data-testid="chat-input-field"
                placeholder={placeholder}
                disabled={disabled}
            />
            <button
                data-testid="submit-button"
                onClick={() => onSubmit('test prompt')}
                disabled={disabled}
            >
                Submit
            </button>
            {showAbort && (
                <button data-testid="abort-button" onClick={onAbort}>
                    Abort
                </button>
            )}
        </div>
    ),
}));

vi.mock('@/components/PromptSuggestions', () => ({
    PromptSuggestions: ({ suggestions, onSelect, disabled }: any) => (
        <div data-testid="prompt-suggestions">
            {suggestions.map((s: any) => (
                <button
                    key={s.prompt}
                    data-testid={`suggestion-${s.prompt}`}
                    onClick={() => onSelect(s.prompt)}
                    disabled={disabled}
                >
                    {s.label}
                </button>
            ))}
        </div>
    ),
}));

vi.mock('@/components/QuickActions/QuickActions', () => ({
    QuickActions: ({ suggestions, onSelect }: any) => (
        <div data-testid="quick-actions">
            {suggestions?.map((s: any) => (
                <button key={s.prompt} onClick={() => onSelect(s.prompt)}>
                    {s.label}
                </button>
            ))}
        </div>
    ),
}));

vi.mock('@/components/ErrorMessage', () => ({
    ErrorMessage: ({ message, onRetry, onDismiss }: any) => (
        <div data-testid="error-message">
            <span>{message}</span>
            {onRetry && <button data-testid="retry-button" onClick={onRetry}>Retry</button>}
            {onDismiss && <button data-testid="dismiss-button" onClick={onDismiss}>Dismiss</button>}
        </div>
    ),
    classifyError: () => 'api',
}));

vi.mock('@/components/FileChangeSummary/FileChangeSummary', () => ({
    FileChangeSummary: () => null,
}));

vi.mock('@/components/MarkdownRenderer/MarkdownRenderer', () => ({
    MarkdownRenderer: ({ content }: any) => <div>{content}</div>,
}));

import { ChatInterface } from '../ChatInterface';

const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
    id: 'msg-1',
    role: 'assistant',
    content: 'Hello there',
    timestamp: new Date('2024-01-01'),
    ...overrides,
});

const defaultProps = {
    onSubmitPrompt: vi.fn().mockResolvedValue(undefined),
    messages: [] as ChatMessage[],
    isLoading: false,
};

describe('ChatInterface', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── Empty state ──────────────────────────────────────────────────────────

    it('renders empty state when no messages', () => {
        render(<ChatInterface {...defaultProps} />);
        expect(screen.getByText(/What would you like to build/i)).toBeInTheDocument();
    });

    it('shows suggestions in empty state', () => {
        const suggestions = [
            { id: 'todo', prompt: 'Build a todo app', label: 'Todo App', category: 'ui' as const, icon: '📋' },
        ];
        render(<ChatInterface {...defaultProps} suggestions={suggestions} />);
        expect(screen.getByTestId('prompt-suggestions')).toBeInTheDocument();
        expect(screen.getByTestId('suggestion-Build a todo app')).toBeInTheDocument();
    });

    it('does not show suggestions when none provided', () => {
        render(<ChatInterface {...defaultProps} suggestions={[]} />);
        expect(screen.queryByTestId('prompt-suggestions')).not.toBeInTheDocument();
    });

    // ─── Messages ─────────────────────────────────────────────────────────────

    it('renders messages', () => {
        const messages = [
            makeMessage({ id: 'msg-1', role: 'user', content: 'Hello' }),
            makeMessage({ id: 'msg-2', role: 'assistant', content: 'Hi there!' }),
        ];
        render(<ChatInterface {...defaultProps} messages={messages} />);
        expect(screen.getByTestId('message-msg-1')).toBeInTheDocument();
        expect(screen.getByTestId('message-msg-2')).toBeInTheDocument();
    });

    it('does not show empty state when messages exist', () => {
        const messages = [makeMessage()];
        render(<ChatInterface {...defaultProps} messages={messages} />);
        expect(screen.queryByText(/What would you like to build/i)).not.toBeInTheDocument();
    });

    // ─── Loading state ────────────────────────────────────────────────────────

    it('shows loading indicator when isLoading and not streaming', () => {
        render(<ChatInterface {...defaultProps} isLoading={true} isStreaming={false} />);
        expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
    });

    it('passes loadingPhase to LoadingIndicator', () => {
        render(<ChatInterface {...defaultProps} isLoading={true} loadingPhase="planning" />);
        expect(screen.getByTestId('loading-indicator')).toHaveAttribute('data-phase', 'planning');
    });

    it('does not show loading indicator when streaming', () => {
        render(
            <ChatInterface
                {...defaultProps}
                isLoading={true}
                isStreaming={true}
                streamingState={{ phase: 'generating', filesReceived: 1, totalFiles: 3, textLength: 100, progressLabel: null, isDegraded: false, files: {}, currentFile: null, error: null, lastHeartbeat: null, warnings: [], summary: null }}
            />
        );
        expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
    });

    // ─── Streaming ────────────────────────────────────────────────────────────

    it('shows streaming indicator when isStreaming is true', () => {
        const streamingState = { phase: 'generating' as const, filesReceived: 2, totalFiles: 5, textLength: 200, progressLabel: null, isDegraded: false, files: {}, currentFile: null, error: null, lastHeartbeat: null, warnings: [], summary: null };
        render(<ChatInterface {...defaultProps} isLoading={true} isStreaming={true} streamingState={streamingState} />);
        expect(screen.getByTestId('streaming-indicator')).toBeInTheDocument();
    });

    it('does not show streaming indicator when isStreaming is false', () => {
        render(<ChatInterface {...defaultProps} isStreaming={false} />);
        expect(screen.queryByTestId('streaming-indicator')).not.toBeInTheDocument();
    });

    // ─── Error display ────────────────────────────────────────────────────────

    it('shows error message when error is provided', () => {
        render(<ChatInterface {...defaultProps} error="Something went wrong" />);
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('does not show error when loading', () => {
        render(<ChatInterface {...defaultProps} isLoading={true} error="Something went wrong" />);
        expect(screen.queryByTestId('error-message')).not.toBeInTheDocument();
    });

    it('calls onClearError when dismiss is clicked', () => {
        const onClearError = vi.fn();
        render(
            <ChatInterface
                {...defaultProps}
                error="Error occurred"
                onClearError={onClearError}
            />
        );
        fireEvent.click(screen.getByTestId('dismiss-button'));
        expect(onClearError).toHaveBeenCalledTimes(1);
    });

    it('calls onRetry when retry is clicked', () => {
        const onRetry = vi.fn();
        render(
            <ChatInterface
                {...defaultProps}
                error="Error occurred"
                onRetry={onRetry}
            />
        );
        fireEvent.click(screen.getByTestId('retry-button'));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    // ─── Prompt submission ────────────────────────────────────────────────────

    it('calls onSubmitPrompt when form is submitted', async () => {
        const onSubmitPrompt = vi.fn().mockResolvedValue(undefined);
        render(<ChatInterface {...defaultProps} onSubmitPrompt={onSubmitPrompt} />);

        fireEvent.click(screen.getByTestId('submit-button'));

        await waitFor(() => {
            expect(onSubmitPrompt).toHaveBeenCalledWith('test prompt', undefined);
        });
    });

    it('calls onSubmitPrompt when suggestion is selected in empty state', async () => {
        const onSubmitPrompt = vi.fn().mockResolvedValue(undefined);
        const suggestions = [{ id: 'todo', prompt: 'Build a todo app', label: 'Todo App', category: 'ui' as const, icon: '📋' }];

        render(<ChatInterface {...defaultProps} onSubmitPrompt={onSubmitPrompt} suggestions={suggestions} />);

        fireEvent.click(screen.getByTestId('suggestion-Build a todo app'));

        await waitFor(() => {
            expect(onSubmitPrompt).toHaveBeenCalledWith('Build a todo app', undefined);
        });
    });

    // ─── Abort button ─────────────────────────────────────────────────────────

    it('shows abort button when isLoading and onAbort provided', () => {
        const onAbort = vi.fn();
        render(<ChatInterface {...defaultProps} isLoading={true} onAbort={onAbort} />);
        expect(screen.getByTestId('abort-button')).toBeInTheDocument();
    });

    it('calls onAbort when abort button is clicked', () => {
        const onAbort = vi.fn();
        render(<ChatInterface {...defaultProps} isLoading={true} onAbort={onAbort} />);
        fireEvent.click(screen.getByTestId('abort-button'));
        expect(onAbort).toHaveBeenCalledTimes(1);
    });

    it('does not show abort button when onAbort not provided', () => {
        render(<ChatInterface {...defaultProps} isLoading={true} />);
        expect(screen.queryByTestId('abort-button')).not.toBeInTheDocument();
    });

    // ─── Chat input ───────────────────────────────────────────────────────────

    it('renders chat input', () => {
        render(<ChatInterface {...defaultProps} />);
        expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    });

    it('passes inputPlaceholder to ChatInput', () => {
        render(<ChatInterface {...defaultProps} inputPlaceholder="Ask something..." />);
        expect(screen.getByTestId('chat-input-field')).toHaveAttribute('placeholder', 'Ask something...');
    });

    it('disables chat input when loading', () => {
        render(<ChatInterface {...defaultProps} isLoading={true} />);
        expect(screen.getByTestId('chat-input-field')).toBeDisabled();
    });

    // ─── Quick actions ────────────────────────────────────────────────────────

    it('shows quick actions when messages exist and not loading', () => {
        const messages = [makeMessage()];
        render(<ChatInterface {...defaultProps} messages={messages} isLoading={false} />);
        expect(screen.getByTestId('quick-actions')).toBeInTheDocument();
    });

    it('does not show quick actions when no messages', () => {
        render(<ChatInterface {...defaultProps} messages={[]} />);
        expect(screen.queryByTestId('quick-actions')).not.toBeInTheDocument();
    });

    // ─── Accessibility ────────────────────────────────────────────────────────

    it('has chat interface region with aria-label', () => {
        render(<ChatInterface {...defaultProps} />);
        expect(screen.getByRole('region', { name: /chat interface/i })).toBeInTheDocument();
    });

    it('has log role for message list', () => {
        render(<ChatInterface {...defaultProps} />);
        expect(screen.getByRole('log')).toBeInTheDocument();
    });
});
