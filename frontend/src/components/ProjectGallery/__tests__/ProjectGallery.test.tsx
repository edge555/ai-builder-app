import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ProjectGallery } from '../ProjectGallery';
import type { StoredProject } from '@/services/storage';

describe('ProjectGallery', () => {
    const mockProjects: StoredProject[] = [
        {
            id: '1',
            name: 'Project Alpha',
            description: 'Test project',
            files: {},
            currentVersionId: 'v1',
            createdAt: '2024-01-01T10:00:00Z',
            updatedAt: '2024-01-03T10:00:00Z',
            chatMessages: [],
            fileCount: 0,
            thumbnailFiles: [],
        },
        {
            id: '2',
            name: 'Project Beta',
            description: 'Test project',
            files: {},
            currentVersionId: 'v1',
            createdAt: '2024-01-02T10:00:00Z',
            updatedAt: '2024-01-02T10:00:00Z',
            chatMessages: [],
            fileCount: 0,
            thumbnailFiles: [],
        },
        {
            id: '3',
            name: 'Test Project',
            description: 'Test project',
            files: {},
            currentVersionId: 'v1',
            createdAt: '2024-01-01T12:00:00Z',
            updatedAt: '2024-01-01T12:00:00Z',
            chatMessages: [],
            fileCount: 0,
            thumbnailFiles: [],
        },
    ];

    const mockHandlers = {
        onOpenProject: vi.fn(),
        onRenameProject: vi.fn(),
        onDuplicateProject: vi.fn(),
        onDeleteProject: vi.fn(),
        onCreateProject: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render list of projects with correct data', () => {
        render(<ProjectGallery projects={mockProjects} {...mockHandlers} />);

        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
        expect(screen.getByText('Project Beta')).toBeInTheDocument();
        expect(screen.getByText('Test Project')).toBeInTheDocument();
        expect(screen.getByText('3 projects')).toBeInTheDocument();
    });

    it('should display singular "project" when only one project exists', () => {
        render(<ProjectGallery projects={[mockProjects[0]]} {...mockHandlers} />);
        expect(screen.getByText('1 project')).toBeInTheDocument();
    });

    it('should filter projects by search query', () => {
        render(<ProjectGallery projects={mockProjects} {...mockHandlers} />);

        const searchInput = screen.getByPlaceholderText('Search projects...');
        fireEvent.change(searchInput, { target: { value: 'Alpha' } });

        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
        expect(screen.queryByText('Project Beta')).not.toBeInTheDocument();
        expect(screen.queryByText('Test Project')).not.toBeInTheDocument();
    });

    it('should show clear search button when search query exists', () => {
        render(<ProjectGallery projects={mockProjects} {...mockHandlers} />);

        const searchInput = screen.getByPlaceholderText('Search projects...');
        fireEvent.change(searchInput, { target: { value: 'test' } });

        const clearButton = screen.getByLabelText('Clear search');
        expect(clearButton).toBeInTheDocument();

        fireEvent.click(clearButton);
        expect(searchInput).toHaveValue('');
    });

    it('should sort projects by last modified (default)', () => {
        render(<ProjectGallery projects={mockProjects} {...mockHandlers} />);

        const projectCards = screen.getAllByRole('article');
        // Project Alpha has the most recent updatedAt
        expect(within(projectCards[0]).getByText('Project Alpha')).toBeInTheDocument();
    });

    it('should sort projects by name (A-Z)', () => {
        render(<ProjectGallery projects={mockProjects} {...mockHandlers} />);

        const sortSelect = screen.getByLabelText('Sort projects');
        fireEvent.change(sortSelect, { target: { value: 'nameAsc' } });

        const projectCards = screen.getAllByRole('article');
        expect(within(projectCards[0]).getByText('Project Alpha')).toBeInTheDocument();
        expect(within(projectCards[1]).getByText('Project Beta')).toBeInTheDocument();
        expect(within(projectCards[2]).getByText('Test Project')).toBeInTheDocument();
    });

    it('should sort projects by oldest first', () => {
        render(<ProjectGallery projects={mockProjects} {...mockHandlers} />);

        const sortSelect = screen.getByLabelText('Sort projects');
        fireEvent.change(sortSelect, { target: { value: 'oldestFirst' } });

        const projectCards = screen.getAllByRole('article');
        // Project Alpha and Test Project were created on 2024-01-01
        // Test Project was created later in the day
        expect(within(projectCards[0]).getByText('Project Alpha')).toBeInTheDocument();
    });

    it('should display empty state when no projects exist', () => {
        render(<ProjectGallery projects={[]} {...mockHandlers} />);

        expect(screen.getByText('No projects yet')).toBeInTheDocument();
        expect(screen.getByText(/Start building your first app with AI/i)).toBeInTheDocument();
        expect(screen.getByText('Create Your First Project')).toBeInTheDocument();
    });

    it('should call onCreateProject when empty state button is clicked', () => {
        render(<ProjectGallery projects={[]} {...mockHandlers} />);

        const createButton = screen.getByText('Create Your First Project');
        fireEvent.click(createButton);

        expect(mockHandlers.onCreateProject).toHaveBeenCalledTimes(1);
    });

    it('should display loading skeleton when isLoading is true', () => {
        render(<ProjectGallery projects={[]} {...mockHandlers} isLoading={true} />);

        expect(screen.getByText('Loading...')).toBeInTheDocument();
        // Should render 3 skeleton cards
        const skeletons = document.querySelectorAll('.project-card-skeleton');
        expect(skeletons.length).toBe(3);
    });

    it('should show empty search state when no projects match search', () => {
        render(<ProjectGallery projects={mockProjects} {...mockHandlers} />);

        const searchInput = screen.getByPlaceholderText('Search projects...');
        fireEvent.change(searchInput, { target: { value: 'NonExistentProject' } });

        expect(screen.getByText('No projects found')).toBeInTheDocument();
        expect(screen.getByText(/No projects match "NonExistentProject"/i)).toBeInTheDocument();
        expect(screen.getByText('Clear Search')).toBeInTheDocument();
    });

    it('should clear search when "Clear Search" button is clicked in empty state', () => {
        render(<ProjectGallery projects={mockProjects} {...mockHandlers} />);

        const searchInput = screen.getByPlaceholderText('Search projects...');
        fireEvent.change(searchInput, { target: { value: 'xyz' } });

        const clearButton = screen.getByText('Clear Search');
        fireEvent.click(clearButton);

        expect(searchInput).toHaveValue('');
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    });

    it('should have proper ARIA labels for accessibility', () => {
        render(<ProjectGallery projects={mockProjects} {...mockHandlers} />);

        expect(screen.getByRole('search')).toBeInTheDocument();
        expect(screen.getByLabelText('Search projects')).toBeInTheDocument();
        expect(screen.getByLabelText('Sort projects')).toBeInTheDocument();
    });

    it('should handle case-insensitive search', () => {
        render(<ProjectGallery projects={mockProjects} {...mockHandlers} />);

        const searchInput = screen.getByPlaceholderText('Search projects...');
        fireEvent.change(searchInput, { target: { value: 'ALPHA' } });

        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
        expect(screen.queryByText('Project Beta')).not.toBeInTheDocument();
    });

    it('should trim whitespace from search query', () => {
        render(<ProjectGallery projects={mockProjects} {...mockHandlers} />);

        const searchInput = screen.getByPlaceholderText('Search projects...');
        fireEvent.change(searchInput, { target: { value: '  Alpha  ' } });

        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
        expect(screen.queryByText('Project Beta')).not.toBeInTheDocument();
    });

    // ========== Tab Functionality Tests ==========

    describe('Tab Navigation', () => {
        it('should render tabs when projects exist', () => {
            render(<ProjectGallery projects={mockProjects} {...mockHandlers} />);

            expect(screen.getByRole('tab', { name: /recent/i })).toBeInTheDocument();
            expect(screen.getByRole('tab', { name: /all projects/i })).toBeInTheDocument();
        });

        it('should not render tabs when no projects exist', () => {
            render(<ProjectGallery projects={[]} {...mockHandlers} />);

            expect(screen.queryByRole('tab', { name: /recent/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('tab', { name: /all projects/i })).not.toBeInTheDocument();
        });

        it('should default to "Recent" tab', () => {
            render(<ProjectGallery projects={mockProjects} {...mockHandlers} />);

            const recentTab = screen.getByRole('tab', { name: /recent/i });
            expect(recentTab).toHaveAttribute('aria-selected', 'true');
        });

        it('should switch to "All Projects" tab when clicked', () => {
            render(<ProjectGallery projects={mockProjects} {...mockHandlers} />);

            const allProjectsTab = screen.getByRole('tab', { name: /all projects/i });
            fireEvent.click(allProjectsTab);

            expect(allProjectsTab).toHaveAttribute('aria-selected', 'true');
            expect(screen.getByRole('tab', { name: /recent/i })).toHaveAttribute('aria-selected', 'false');
        });
    });

    describe('Recent Projects View', () => {
        const fourProjects: StoredProject[] = [
            ...mockProjects,
            {
                id: '4',
                name: 'Project Delta',
                description: 'Test project',
                files: {},
                currentVersionId: 'v1',
                createdAt: '2024-01-04T10:00:00Z',
                updatedAt: '2024-01-04T10:00:00Z',
                chatMessages: [],
                fileCount: 0,
                thumbnailFiles: [],
            },
        ];

        it('should show all projects when 3 or fewer exist', () => {
            render(<ProjectGallery projects={mockProjects} {...mockHandlers} />);

            // Should be on Recent tab by default
            expect(screen.getByText('Project Alpha')).toBeInTheDocument();
            expect(screen.getByText('Project Beta')).toBeInTheDocument();
            expect(screen.getByText('Test Project')).toBeInTheDocument();
        });

        it('should show only 3 most recent projects when more than 3 exist', () => {
            render(<ProjectGallery projects={fourProjects} {...mockHandlers} />);

            // Should show the 3 most recently updated projects
            const projectCards = screen.getAllByRole('article');
            expect(projectCards.length).toBe(3);
        });

        it('should show "View all projects" link when more than 3 projects exist', () => {
            render(<ProjectGallery projects={fourProjects} {...mockHandlers} />);

            expect(screen.getByText(/view all projects/i)).toBeInTheDocument();
        });

        it('should not show "View all projects" link when 3 or fewer projects exist', () => {
            render(<ProjectGallery projects={mockProjects} {...mockHandlers} />);

            expect(screen.queryByText(/view all projects/i)).not.toBeInTheDocument();
        });

        it('should switch to "All Projects" tab when "View all" link is clicked', () => {
            render(<ProjectGallery projects={fourProjects} {...mockHandlers} />);

            const viewAllLink = screen.getByText(/view all projects/i);
            fireEvent.click(viewAllLink);

            const allProjectsTab = screen.getByRole('tab', { name: /all projects/i });
            expect(allProjectsTab).toHaveAttribute('aria-selected', 'true');
        });

        it('should sort recent projects by most recently updated', () => {
            render(<ProjectGallery projects={mockProjects} {...mockHandlers} />);

            const projectCards = screen.getAllByRole('article');
            // Project Alpha has updatedAt: 2024-01-03 (most recent)
            // Project Beta has updatedAt: 2024-01-02
            // Test Project has updatedAt: 2024-01-01 (oldest)
            expect(within(projectCards[0]).getByText('Project Alpha')).toBeInTheDocument();
            expect(within(projectCards[1]).getByText('Project Beta')).toBeInTheDocument();
            expect(within(projectCards[2]).getByText('Test Project')).toBeInTheDocument();
        });
    });

    describe('Search and Sort Controls', () => {
        it('should hide search and sort controls on "Recent" tab', () => {
            render(<ProjectGallery projects={mockProjects} {...mockHandlers} />);

            // Should be on Recent tab by default
            expect(screen.queryByPlaceholderText('Search projects...')).not.toBeInTheDocument();
            expect(screen.queryByLabelText('Sort projects')).not.toBeInTheDocument();
        });

        it('should show search and sort controls on "All Projects" tab', () => {
            render(<ProjectGallery projects={mockProjects} {...mockHandlers} />);

            const allProjectsTab = screen.getByRole('tab', { name: /all projects/i });
            fireEvent.click(allProjectsTab);

            expect(screen.getByPlaceholderText('Search projects...')).toBeInTheDocument();
            expect(screen.getByLabelText('Sort projects')).toBeInTheDocument();
        });

        it('should maintain search query when switching tabs', () => {
            render(<ProjectGallery projects={mockProjects} {...mockHandlers} />);

            // Switch to All Projects tab
            const allProjectsTab = screen.getByRole('tab', { name: /all projects/i });
            fireEvent.click(allProjectsTab);

            // Enter search query
            const searchInput = screen.getByPlaceholderText('Search projects...');
            fireEvent.change(searchInput, { target: { value: 'Alpha' } });

            // Switch back to Recent tab
            const recentTab = screen.getByRole('tab', { name: /recent/i });
            fireEvent.click(recentTab);

            // Switch to All Projects tab again
            fireEvent.click(allProjectsTab);

            // Search query should be maintained
            expect(screen.getByPlaceholderText('Search projects...')).toHaveValue('Alpha');
        });
    });
});

