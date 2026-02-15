import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ChatMessagesProvider } from '../ChatMessagesContext';
import { useChatMessages } from '../ChatMessagesContext.context';

// Test component
function TestComponent() {
    const { messages, addUserMessage, addAssistantMessage } = useChatMessages();

    return (
        <div>
            <div data-testid="message-count">{messages.length}</div>
            <button onClick={() => addUserMessage('Test user message')}>
                Add User Message
            </button>
            <button onClick={() => addAssistantMessage('Test assistant message')}>
                Add Assistant Message
            </button>
        </div>
    );
}

describe('ChatMessagesContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should provide empty messages initially', () => {
        render(
            <ChatMessagesProvider>
                <TestComponent />
            </ChatMessagesProvider>
        );

        expect(screen.getByTestId('message-count')).toHaveTextContent('0');
    });

    it('should add user message', () => {
        render(
            <ChatMessagesProvider>
                <TestComponent />
            </ChatMessagesProvider>
        );

        const button = screen.getByText('Add User Message');
        act(() => {
            button.click();
        });

        expect(screen.getByTestId('message-count')).toHaveTextContent('1');
    });

    it('should add assistant message', () => {
        render(
            <ChatMessagesProvider>
                <TestComponent />
            </ChatMessagesProvider>
        );

        const button = screen.getByText('Add Assistant Message');
        act(() => {
            button.click();
        });

        expect(screen.getByTestId('message-count')).toHaveTextContent('1');
    });
});
