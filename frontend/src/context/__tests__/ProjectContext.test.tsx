import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ProjectProvider, useProject } from '../ProjectContext';
import type { SerializedProjectState } from '@/shared';

// Test component to access context
function TestComponent() {
    const { projectState, setProjectState } = useProject();

    return (
        <div>
            <div data-testid="project-name">{projectState?.name || 'No project'}</div>
            <button
                onClick={() =>
                    setProjectState(
                        {
                            id: 'test-1',
                            name: 'Test Project',
                            files: {},
                        },
                        false
                    )
                }
            >
                Set Project
            </button>
        </div>
    );
}

describe('ProjectContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should provide initial null project state', () => {
        render(
            <ProjectProvider>
                <TestComponent />
            </ProjectProvider>
        );

        expect(screen.getByTestId('project-name')).toHaveTextContent('No project');
    });

    it('should update project state', () => {
        render(
            <ProjectProvider>
                <TestComponent />
            </ProjectProvider>
        );

        const button = screen.getByText('Set Project');
        act(() => {
            button.click();
        });

        expect(screen.getByTestId('project-name')).toHaveTextContent('Test Project');
    });

    it('should throw error when used outside provider', () => {
        // Suppress console.error for this test
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        expect(() => render(<TestComponent />)).toThrow();

        consoleSpy.mockRestore();
    });
});
