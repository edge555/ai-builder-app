import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TemplateGrid } from '../TemplateGrid';
import type { StarterTemplate } from '@/data/templates';

describe('TemplateGrid', () => {
    const mockTemplates: StarterTemplate[] = [
        {
            id: '1',
            name: 'Analytics Dashboard',
            description: 'Track your metrics',
            category: 'Dashboard',
            icon: '📊',
            prompt: 'Create an analytics dashboard',
        },
        {
            id: '2',
            name: 'Landing Page',
            description: 'Marketing website',
            category: 'Marketing',
            icon: '🚀',
            prompt: 'Create a landing page',
        },
        {
            id: '3',
            name: 'Todo App',
            description: 'Task management',
            category: 'Productivity',
            icon: '✅',
            prompt: 'Create a todo app',
        },
        {
            id: '4',
            name: 'E-Commerce Store',
            description: 'Online shopping',
            category: 'E-Commerce',
            icon: '🛒',
            prompt: 'Create an e-commerce store',
        },
    ];

    const mockOnSelect = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render all templates in grid layout', () => {
        render(<TemplateGrid templates={mockTemplates} onSelect={mockOnSelect} />);

        expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();
        expect(screen.getByText('Landing Page')).toBeInTheDocument();
        expect(screen.getByText('Todo App')).toBeInTheDocument();
        expect(screen.getByText('E-Commerce Store')).toBeInTheDocument();
    });

    it('should display all category filters', () => {
        render(<TemplateGrid templates={mockTemplates} onSelect={mockOnSelect} />);

        expect(screen.getByRole('button', { name: /Filter by All category/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Filter by Dashboard category/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Filter by Marketing category/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Filter by Productivity category/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Filter by E-Commerce category/i })).toBeInTheDocument();
    });

    it('should filter templates by category', () => {
        render(<TemplateGrid templates={mockTemplates} onSelect={mockOnSelect} />);

        const dashboardFilter = screen.getByRole('button', { name: /Filter by Dashboard category/i });
        fireEvent.click(dashboardFilter);

        expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();
        expect(screen.queryByText('Landing Page')).not.toBeInTheDocument();
        expect(screen.queryByText('Todo App')).not.toBeInTheDocument();
        expect(screen.queryByText('E-Commerce Store')).not.toBeInTheDocument();
    });

    it('should show all templates when "All" category is selected', () => {
        render(<TemplateGrid templates={mockTemplates} onSelect={mockOnSelect} />);

        // First filter by a category
        const dashboardFilter = screen.getByRole('button', { name: /Filter by Dashboard category/i });
        fireEvent.click(dashboardFilter);

        // Then click "All"
        const allFilter = screen.getByRole('button', { name: /Filter by All category/i });
        fireEvent.click(allFilter);

        expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();
        expect(screen.getByText('Landing Page')).toBeInTheDocument();
        expect(screen.getByText('Todo App')).toBeInTheDocument();
        expect(screen.getByText('E-Commerce Store')).toBeInTheDocument();
    });

    it('should filter templates by search query (name)', () => {
        render(<TemplateGrid templates={mockTemplates} onSelect={mockOnSelect} />);

        const searchInput = screen.getByPlaceholderText('Search templates...');
        fireEvent.change(searchInput, { target: { value: 'Dashboard' } });

        expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();
        expect(screen.queryByText('Landing Page')).not.toBeInTheDocument();
        expect(screen.queryByText('Todo App')).not.toBeInTheDocument();
    });

    it('should filter templates by search query (description)', () => {
        render(<TemplateGrid templates={mockTemplates} onSelect={mockOnSelect} />);

        const searchInput = screen.getByPlaceholderText('Search templates...');
        fireEvent.change(searchInput, { target: { value: 'metrics' } });

        expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();
        expect(screen.queryByText('Landing Page')).not.toBeInTheDocument();
    });

    it('should show clear search button when search query exists', () => {
        render(<TemplateGrid templates={mockTemplates} onSelect={mockOnSelect} />);

        const searchInput = screen.getByPlaceholderText('Search templates...');
        fireEvent.change(searchInput, { target: { value: 'test' } });

        const clearButton = screen.getByLabelText('Clear search');
        expect(clearButton).toBeInTheDocument();

        fireEvent.click(clearButton);
        expect(searchInput).toHaveValue('');
    });

    it('should display empty state when no templates match search', () => {
        render(<TemplateGrid templates={mockTemplates} onSelect={mockOnSelect} />);

        const searchInput = screen.getByPlaceholderText('Search templates...');
        fireEvent.change(searchInput, { target: { value: 'NonExistentTemplate' } });

        expect(screen.getByText(/No templates matching "NonExistentTemplate" found/i)).toBeInTheDocument();
        expect(screen.getByText('Clear Search')).toBeInTheDocument();
    });

    it('should display empty state when category has no templates', () => {
        render(<TemplateGrid templates={mockTemplates} onSelect={mockOnSelect} />);

        const socialFilter = screen.getByRole('button', { name: /Filter by Social category/i });
        fireEvent.click(socialFilter);

        expect(screen.getByText(/No templates found in this category/i)).toBeInTheDocument();
    });

    it('should call onSelect with correct template when template is clicked', () => {
        render(<TemplateGrid templates={mockTemplates} onSelect={mockOnSelect} />);

        const templateButton = screen.getByLabelText('Select Analytics Dashboard template');
        fireEvent.click(templateButton);

        expect(mockOnSelect).toHaveBeenCalledTimes(1);
        expect(mockOnSelect).toHaveBeenCalledWith(mockTemplates[0]);
    });

    it('should combine category and search filters', () => {
        render(<TemplateGrid templates={mockTemplates} onSelect={mockOnSelect} />);

        // Filter by Marketing category
        const marketingFilter = screen.getByRole('button', { name: /Filter by Marketing category/i });
        fireEvent.click(marketingFilter);

        // Then search for "Landing"
        const searchInput = screen.getByPlaceholderText('Search templates...');
        fireEvent.change(searchInput, { target: { value: 'Landing' } });

        expect(screen.getByText('Landing Page')).toBeInTheDocument();
        expect(screen.queryByText('Analytics Dashboard')).not.toBeInTheDocument();
    });

    it('should have active state on selected category filter', () => {
        render(<TemplateGrid templates={mockTemplates} onSelect={mockOnSelect} />);

        const dashboardFilter = screen.getByRole('button', { name: /Filter by Dashboard category/i });
        fireEvent.click(dashboardFilter);

        expect(dashboardFilter).toHaveClass('active');
        expect(dashboardFilter).toHaveAttribute('aria-pressed', 'true');
    });

    it('should announce filter changes to screen readers', () => {
        render(<TemplateGrid templates={mockTemplates} onSelect={mockOnSelect} />);

        const announcement = screen.getByRole('status');
        expect(announcement).toHaveTextContent('4 templates found');

        const dashboardFilter = screen.getByRole('button', { name: /Filter by Dashboard category/i });
        fireEvent.click(dashboardFilter);

        expect(announcement).toHaveTextContent('1 template found in Dashboard');
    });

    it('should handle case-insensitive search', () => {
        render(<TemplateGrid templates={mockTemplates} onSelect={mockOnSelect} />);

        const searchInput = screen.getByPlaceholderText('Search templates...');
        fireEvent.change(searchInput, { target: { value: 'ANALYTICS' } });

        expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();
    });

    it('should trim whitespace from search query', () => {
        render(<TemplateGrid templates={mockTemplates} onSelect={mockOnSelect} />);

        const searchInput = screen.getByPlaceholderText('Search templates...');
        fireEvent.change(searchInput, { target: { value: '  Dashboard  ' } });

        expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();
    });

    it('should have proper ARIA labels for accessibility', () => {
        render(<TemplateGrid templates={mockTemplates} onSelect={mockOnSelect} />);

        expect(screen.getByRole('search')).toBeInTheDocument();
        expect(screen.getByLabelText('Search templates')).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Template category filters' })).toBeInTheDocument();
    });
});
