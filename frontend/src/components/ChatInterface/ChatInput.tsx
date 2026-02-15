import { useState, useRef, useEffect } from 'react';
import './ChatInterface.css';

export interface ChatInputProps {
  /** Callback when user submits a prompt */
  onSubmit: (prompt: string) => Promise<void>;
  /** Whether submission is disabled (e.g., during loading) */
  disabled?: boolean;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Whether to show abort button */
  showAbort?: boolean;
  /** Callback to abort current request */
  onAbort?: () => void;
}

/**
 * Chat input component with textarea and submit button.
 * Supports Ctrl+Enter / Cmd+Enter for quick submission.
 *
 * Features:
 * - Auto-focus on mount
 * - Keyboard shortcuts (Ctrl/Cmd + Enter to submit)
 * - Loading state with spinner
 * - Optional abort button during loading
 */
export function ChatInput({
  onSubmit,
  disabled = false,
  placeholder = 'Describe your app or request a modification...',
  showAbort = false,
  onAbort,
}: ChatInputProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = inputValue.trim();
    if (!trimmedInput || disabled) return;

    setInputValue('');
    await onSubmit(trimmedInput);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Ctrl+Enter (Windows/Linux) or Meta+Enter (Mac)
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form className="chat-input-form" onSubmit={handleSubmit}>
      <textarea
        ref={inputRef}
        className="chat-input ui-textarea"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={3}
        aria-label="Chat input"
      />
      <button
        type="submit"
        className="chat-submit-button ui-button"
        data-variant="primary"
        disabled={disabled || !inputValue.trim()}
        aria-label="Send message"
      >
        {disabled ? (
          <span className="export-button-spinner"></span>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        )}
      </button>
      {disabled && showAbort && onAbort && (
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
  );
}
