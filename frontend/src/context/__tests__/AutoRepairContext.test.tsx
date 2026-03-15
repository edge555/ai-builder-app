import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AutoRepairProvider } from '../AutoRepairContext';
import { useAutoRepair } from '../AutoRepairContext.context';

vi.mock('../ProjectContext.context', () => ({
    useProjectState: vi.fn(() => ({ projectState: null })),
    useProjectActions: vi.fn(() => ({ setProjectState: vi.fn() })),
}));

vi.mock('../ChatMessagesContext.context', () => ({
    useChatMessages: vi.fn(() => ({
        messages: [],
        addUserMessage: vi.fn(),
        addAssistantMessage: vi.fn(),
        addErrorMessage: vi.fn(),
    })),
}));

vi.mock('../PreviewErrorContext.context', () => ({
    usePreviewErrorState: vi.fn(() => ({ errors: [], hasErrors: false, repairAttempts: 0 })),
    usePreviewErrorActions: vi.fn(() => ({ addError: vi.fn(), clearErrors: vi.fn(), incrementRepairAttempts: vi.fn(), resetRepairAttempts: vi.fn() })),
}));

vi.mock('../GenerationContext.context', () => ({
    useGenerationState: vi.fn(() => ({ isLoading: false, loadingPhase: null })),
    useGenerationActions: vi.fn(() => ({ modifyProject: vi.fn(), setIsLoading: vi.fn(), setLoadingPhase: vi.fn(), clearError: vi.fn() })),
}));

// Test component
function TestComponent() {
    const { triggerAutoRepair } = useAutoRepair();

    return (
        <div>
            <button onClick={() => triggerAutoRepair()}>Trigger</button>
        </div>
    );
}

describe('AutoRepairContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should provide auto-repair actions', () => {
        render(
            <AutoRepairProvider>
                <TestComponent />
            </AutoRepairProvider>
        );

        expect(screen.getByText('Trigger')).toBeInTheDocument();
    });
});
