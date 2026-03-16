import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { StoredProject } from '@/services/storage';

import { WelcomePage } from '../WelcomePage';


// Mock child components
vi.mock('@/components/TemplateGrid/TemplateGrid', () => ({
    TemplateGrid: ({ onSelect }: any) => (
        <div data-testid="template-grid">
            <button onClick={() => onSelect({ prompt: 'Test template prompt' })}>
                Test Template
            </button>
        </div>
    ),
}));

vi.mock('@/components/ProjectGallery/ProjectGallery', () => ({
    ProjectGallery: ({ projects, onCreateProject, onDeleteProject }: any) => (
        <div data-testid="project-gallery">
            {projects.length === 0 ? (
                <button onClick={onCreateProject}>Create Project</button>
            ) : (
                <>
                    <div>{projects.length} projects</div>
                    {projects.map((p: any) => (
                        <button key={p.id} onClick={() => onDeleteProject(p.id)}>
                            Delete {p.name}
                        </button>
                    ))}
                </>
            )}
        </div>
    ),
}));

vi.mock('@/components/ThemeToggle/ThemeToggle', () => ({
    ThemeToggle: () => <button data-testid="theme-toggle">Toggle Theme</button>,
}));

vi.mock('@/components/SiteHeader/SiteHeader', () => ({
    SiteHeader: ({ children, actions }: any) => (
        <header data-testid="site-header">
            {children}
            {actions}
            <button data-testid="theme-toggle">Toggle Theme</button>
        </header>
    ),
}));

vi.mock('@/components/OnboardingOverlay/OnboardingOverlay', () => ({
    OnboardingOverlay: () => null,
    shouldShowOnboarding: () => false,
}));

vi.mock('@/components/ConfirmDialog/ConfirmDialog', () => ({
    ConfirmDialog: ({ isOpen, title, message, onConfirm, onCancel }: any) =>
        isOpen ? (
            <div data-testid="confirm-dialog">
                <p data-testid="confirm-dialog-title">{title}</p>
                <p data-testid="confirm-dialog-message">{message}</p>
                <button onClick={onConfirm}>Confirm</button>
                <button onClick={onCancel}>Cancel</button>
            </div>
        ) : null,
}));

describe('WelcomePage', () => {
    const mockProjects: StoredProject[] = [
        {
            id: '1',
            name: 'Test Project',
            description: 'Test description',
            files: { 'index.html': '<html></html>' },
            currentVersionId: 'v1',
            createdAt: '2024-01-01T10:00:00Z',
            updatedAt: '2024-01-01T10:00:00Z',
            chatMessages: [],
            fileCount: 1,
            thumbnailFiles: ['index.html'],
        },
    ];

    const mockHandlers = {
        onEnterApp: vi.fn(),
        onOpenProject: vi.fn(),
        onDeleteProject: vi.fn(),
        onRenameProject: vi.fn(),
        onDuplicateProject: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // Restore IntersectionObserver mock after clearing (clearAllMocks resets implementation)
        // Must use regular function (not arrow) so it can be called with `new`
        global.IntersectionObserver = vi.fn().mockImplementation(function() {
            return {
                observe: vi.fn(),
                unobserve: vi.fn(),
                disconnect: vi.fn(),
                root: null,
                rootMargin: '',
                thresholds: [],
                takeRecords: () => [],
            };
        });
    });

    it('should render hero section with correct content', () => {
        render(<WelcomePage savedProjects={[]} {...mockHandlers} />);

        expect(screen.getByText('Build apps with AI in seconds')).toBeInTheDocument();
        expect(screen.getByText(/Describe your idea and watch it come to life/i)).toBeInTheDocument();
    });

    it('should render prompt input field', () => {
        render(<WelcomePage savedProjects={[]} {...mockHandlers} />);

        const input = screen.getByPlaceholderText('Describe the app you want to build...');
        expect(input).toBeInTheDocument();
    });

    it('should render suggestion chips', () => {
        render(<WelcomePage savedProjects={[]} {...mockHandlers} />);

        expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();
        expect(screen.getByText('Landing Page')).toBeInTheDocument();
        expect(screen.getByText('Task Manager')).toBeInTheDocument();
    });

    it('should populate input when suggestion chip is clicked', () => {
        render(<WelcomePage savedProjects={[]} {...mockHandlers} />);

        const suggestionChip = screen.getByText('Analytics Dashboard');
        fireEvent.click(suggestionChip);

        const input = screen.getByPlaceholderText('Describe the app you want to build...');
        // Clicking a chip sets the prompt text (not the label)
        expect(input).not.toHaveValue('');
    });

    it('should call onEnterApp with prompt when form is submitted', () => {
        render(<WelcomePage savedProjects={[]} {...mockHandlers} />);

        const input = screen.getByPlaceholderText('Describe the app you want to build...');
        const submitButton = screen.getByLabelText('Start building');

        fireEvent.change(input, { target: { value: 'Build a calculator app' } });
        fireEvent.click(submitButton);

        expect(mockHandlers.onEnterApp).toHaveBeenCalledWith('Build a calculator app');
    });

    it('should call onEnterApp without prompt when submitted empty', () => {
        render(<WelcomePage savedProjects={[]} {...mockHandlers} />);

        const input = screen.getByPlaceholderText('Describe the app you want to build...');
        fireEvent.change(input, { target: { value: '   ' } }); // Whitespace only

        const form = input.closest('form');
        if (form) {
            fireEvent.submit(form);
        }

        expect(mockHandlers.onEnterApp).toHaveBeenCalledWith();
    });

    it('should submit form on Enter key (without Shift)', () => {
        render(<WelcomePage savedProjects={[]} {...mockHandlers} />);

        const input = screen.getByPlaceholderText('Describe the app you want to build...');
        fireEvent.change(input, { target: { value: 'Test prompt' } });
        fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

        expect(mockHandlers.onEnterApp).toHaveBeenCalledWith('Test prompt');
    });

    it('should not submit form on Shift+Enter', () => {
        render(<WelcomePage savedProjects={[]} {...mockHandlers} />);

        const input = screen.getByPlaceholderText('Describe the app you want to build...');
        fireEvent.change(input, { target: { value: 'Test prompt' } });
        fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

        expect(mockHandlers.onEnterApp).not.toHaveBeenCalled();
    });

    it('should disable submit button when input is empty', () => {
        render(<WelcomePage savedProjects={[]} {...mockHandlers} />);

        const submitButton = screen.getByLabelText('Start building');
        expect(submitButton).toBeDisabled();
    });

    it('should enable submit button when input has text', () => {
        render(<WelcomePage savedProjects={[]} {...mockHandlers} />);

        const input = screen.getByPlaceholderText('Describe the app you want to build...');
        const submitButton = screen.getByLabelText('Start building');

        fireEvent.change(input, { target: { value: 'Test' } });
        expect(submitButton).not.toBeDisabled();
    });

    it('should render project gallery', () => {
        render(<WelcomePage savedProjects={mockProjects} {...mockHandlers} />);

        expect(screen.getByTestId('project-gallery')).toBeInTheDocument();
    });

    it('should render template grid', () => {
        render(<WelcomePage savedProjects={[]} {...mockHandlers} />);

        expect(screen.getByTestId('template-grid')).toBeInTheDocument();
        expect(screen.getByText('Start from a template')).toBeInTheDocument();
    });

    it('should call onEnterApp with template prompt when template is selected', () => {
        render(<WelcomePage savedProjects={[]} {...mockHandlers} />);

        const templateButton = screen.getByText('Test Template');
        fireEvent.click(templateButton);

        expect(mockHandlers.onEnterApp).toHaveBeenCalledWith('Test template prompt');
    });

    it('should render theme toggle in header', () => {
        render(<WelcomePage savedProjects={[]} {...mockHandlers} />);

        expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    });

    it('should show "New Project" button when projects exist', () => {
        render(<WelcomePage savedProjects={mockProjects} {...mockHandlers} />);

        expect(screen.getByText('New Project')).toBeInTheDocument();
    });

    it('should not show "New Project" button when no projects exist', () => {
        render(<WelcomePage savedProjects={[]} {...mockHandlers} />);

        expect(screen.queryByText('New Project')).not.toBeInTheDocument();
    });

    it('should call onEnterApp when "New Project" button is clicked', () => {
        render(<WelcomePage savedProjects={mockProjects} {...mockHandlers} />);

        const newProjectButton = screen.getByText('New Project');
        fireEvent.click(newProjectButton);

        expect(mockHandlers.onEnterApp).toHaveBeenCalledWith();
    });

    it('should render features section', () => {
        render(<WelcomePage savedProjects={[]} {...mockHandlers} />);

        expect(screen.getByText('Live Preview')).toBeInTheDocument();
        expect(screen.getByText('Fast Generation')).toBeInTheDocument();
        expect(screen.getByText('Export Ready')).toBeInTheDocument();
        expect(screen.getByText('Code Editor')).toBeInTheDocument();
    });

    it('should render footer', () => {
        render(<WelcomePage savedProjects={[]} {...mockHandlers} />);

        expect(screen.getByText('© 2026 AI App Builder')).toBeInTheDocument();
    });

    it('should pass isLoadingProjects to ProjectGallery', () => {
        const { rerender } = render(
            <WelcomePage savedProjects={[]} {...mockHandlers} isLoadingProjects={true} />
        );

        // Component should render even when loading
        expect(screen.getByTestId('project-gallery')).toBeInTheDocument();

        rerender(<WelcomePage savedProjects={[]} {...mockHandlers} isLoadingProjects={false} />);
        expect(screen.getByTestId('project-gallery')).toBeInTheDocument();
    });

    describe('delete confirmation dialog', () => {
        it('shows the project name in the confirmation message', () => {
            render(<WelcomePage savedProjects={mockProjects} {...mockHandlers} />);

            fireEvent.click(screen.getByText('Delete Test Project'));

            expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('"Test Project"');
        });

        it('never shows "null" in the confirmation message', () => {
            render(<WelcomePage savedProjects={mockProjects} {...mockHandlers} />);

            fireEvent.click(screen.getByText('Delete Test Project'));

            expect(screen.getByTestId('confirm-dialog-message')).not.toHaveTextContent('"null"');
        });

        it('calls onDeleteProject with the correct id when confirmed', () => {
            render(<WelcomePage savedProjects={mockProjects} {...mockHandlers} />);

            fireEvent.click(screen.getByText('Delete Test Project'));
            fireEvent.click(screen.getByText('Confirm'));

            expect(mockHandlers.onDeleteProject).toHaveBeenCalledWith('1');
        });

        it('does not call onDeleteProject when cancelled', () => {
            render(<WelcomePage savedProjects={mockProjects} {...mockHandlers} />);

            fireEvent.click(screen.getByText('Delete Test Project'));
            fireEvent.click(screen.getByText('Cancel'));

            expect(mockHandlers.onDeleteProject).not.toHaveBeenCalled();
            expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
        });
    });
});
