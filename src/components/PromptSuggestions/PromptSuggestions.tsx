import React from 'react';
import type { PromptSuggestion } from '@/data/prompt-suggestions';
import './PromptSuggestions.css';

export interface PromptSuggestionsProps {
  suggestions: PromptSuggestion[];
  onSelect: (prompt: string) => void;
  variant?: 'chips' | 'cards';
  disabled?: boolean;
}

/**
 * Displays clickable prompt suggestions as chips or cards.
 */
export function PromptSuggestions({
  suggestions,
  onSelect,
  variant = 'chips',
  disabled = false,
}: PromptSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className={`prompt-suggestions prompt-suggestions--${variant}`} role="group" aria-label="Prompt suggestions">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.id}
          className={`prompt-suggestion prompt-suggestion--${suggestion.category}`}
          onClick={() => onSelect(suggestion.prompt)}
          disabled={disabled}
          type="button"
          title={suggestion.prompt}
        >
          <span className="prompt-suggestion-icon" aria-hidden="true">
            {suggestion.icon}
          </span>
          <span className="prompt-suggestion-label">{suggestion.label}</span>
        </button>
      ))}
    </div>
  );
}

export default PromptSuggestions;
