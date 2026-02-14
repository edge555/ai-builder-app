import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ProjectGallery } from '../ProjectGallery';
import type { StoredProject } from '@/services/storage';

describe('ProjectGallery', () => {
    const mockProjects: StoredProject[] = [
        {
            id: '1',
            name: 'Project Alpha',
            projectState: { name: 'Project Alpha', files: {} },
            createdAt: '2024-01-01T10:00:00Z',
            updatedAt: '2024-01-03T10:00:00Z',
        },
        {
            id: '2',
            name: 'Project Beta',
            projectState: { name: 'Project Beta', files: {} },
            createdAt: '2024-01-02T10:00:00Z',
            updatedAt: '2024-01-02T10:00:00Z',
        },
        {
            id: '3',
            name: 'Test Project',
            projectState: { name: 'Test Project', files: {} },
            createdAt: '2024-01-01T12:00:00Z',
            updatedAt: '2024-01-01T12:00:00Z',
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
});
