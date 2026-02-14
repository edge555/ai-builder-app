import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { VersionProvider, useVersion } from '../VersionContext';

// Test component
function TestComponent() {
    const { canUndo, canRedo, undo, redo } = useVersion();

    return (
        <div>
            <div data-testid="can-undo">{canUndo ? 'yes' : 'no'}</div>
            <div data-testid="can-redo">{canRedo ? 'yes' : 'no'}</div>
            <button onClick={undo}>Undo</button>
            <button onClick={redo}>Redo</button>
        </div>
    );
}

describe('VersionContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should provide version control state', () => {
        render(
            <VersionProvider>
                <TestComponent />
            </VersionProvider>
        );

        expect(screen.getByTestId('can-undo')).toBeInTheDocument();
        expect(screen.getByTestId('can-redo')).toBeInTheDocument();
    });

    it('should have undo and redo functions', () => {
        render(
            <VersionProvider>
                <TestComponent />
            </VersionProvider>
        );

        expect(screen.getByText('Undo')).toBeInTheDocument();
        expect(screen.getByText('Redo')).toBeInTheDocument();
    });
});
