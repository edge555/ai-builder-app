import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VersionProvider } from '../VersionContext';
import { useVersions } from '../VersionContext.context';

// Test component
function TestComponent() {
    const { versions, isLoadingVersions } = useVersions();

    return (
        <div>
            <div data-testid="version-count">{versions.length}</div>
            <div data-testid="loading-status">{isLoadingVersions ? 'loading' : 'idle'}</div>
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

        expect(screen.getByTestId('version-count')).toBeInTheDocument();
        expect(screen.getByTestId('loading-status')).toHaveTextContent('idle');
    });
});
