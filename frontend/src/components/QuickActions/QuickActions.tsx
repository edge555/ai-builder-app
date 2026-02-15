import { useRef, useEffect } from 'react';
import { Bug, Moon, Smartphone, Sparkles, Wand2 } from 'lucide-react';
import type { PromptSuggestion } from '@/data/prompt-suggestions';
import './QuickActions.css';

export interface QuickActionsProps {
    suggestions: PromptSuggestion[];
    onSelect: (prompt: string) => void;
    disabled?: boolean;
    error?: string | null;
}

/**
 * QuickActions component displays contextual suggestion chips above the chat input.
 */
export function QuickActions({
    suggestions,
    onSelect,
    disabled = false,
    error = null,
}: QuickActionsProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to start if suggestions change
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollLeft = 0;
        }
    }, [suggestions, error]);

    // Specific quick actions
    const fixErrorsAction: PromptSuggestion = {
        id: 'fix-errors',
        label: 'Fix errors',
        prompt: 'Please fix the errors in the application.',
        icon: <Bug size={14} />,
        category: 'utility'
    };

    const darkModeAction: PromptSuggestion = {
        id: 'add-dark-mode',
        label: 'Add dark mode',
        prompt: 'Add dark mode support to the application.',
        icon: <Moon size={14} />,
        category: 'ui'
    };

    const responsiveAction: PromptSuggestion = {
        id: 'make-responsive',
        label: 'Make responsive',
        prompt: 'Make the application fully responsive for all device sizes.',
        icon: <Smartphone size={14} />,
        category: 'ui'
    };

    const animationsAction: PromptSuggestion = {
        id: 'add-animations',
        label: 'Add animations',
        prompt: 'Add smooth animations and transitions to the interface.',
        icon: <Wand2 size={14} />,
        category: 'ui'
    };

    // Combine actions, prioritizing "Fix errors" if there's an error
    const allActions = [
        ...(error ? [fixErrorsAction] : []),
        ...suggestions.slice(0, 3), // Show a few dynamic suggestions
        darkModeAction,
        responsiveAction,
        animationsAction,
    ];

    if (allActions.length === 0) return null;

    return (
        <div className="quick-actions" role="group" aria-label="Quick actions">
            <div className="quick-actions-scroll" ref={scrollRef}>
                {allActions.map((action) => (
                    <button
                        key={action.id}
                        className={`quick-action-chip quick-action--${action.category} ${action.id === 'fix-errors' ? 'quick-action--error' : ''}`}
                        onClick={() => onSelect(action.prompt)}
                        disabled={disabled}
                        type="button"
                        title={action.prompt}
                    >
                        <span className="quick-action-icon" aria-hidden="true">
                            {action.icon || <Sparkles size={14} />}
                        </span>
                        <span className="quick-action-label">{action.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

export default QuickActions;
