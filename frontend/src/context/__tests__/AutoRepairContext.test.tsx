import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AutoRepairProvider } from '../AutoRepairContext';
import { useAutoRepair } from '../AutoRepairContext.context';

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
