import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AutoRepairProvider, useAutoRepair } from '../AutoRepairContext';

// Test component
function TestComponent() {
    const { isAutoRepairEnabled, toggleAutoRepair } = useAutoRepair();

    return (
        <div>
            <div data-testid="auto-repair-status">
                {isAutoRepairEnabled ? 'enabled' : 'disabled'}
            </div>
            <button onClick={toggleAutoRepair}>Toggle</button>
        </div>
    );
}

describe('AutoRepairContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should provide auto-repair state', () => {
        render(
            <AutoRepairProvider>
                <TestComponent />
            </AutoRepairProvider>
        );

        expect(screen.getByTestId('auto-repair-status')).toBeInTheDocument();
    });
});
