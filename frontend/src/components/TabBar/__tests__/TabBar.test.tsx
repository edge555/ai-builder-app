import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { TabBar } from '../TabBar';

describe('TabBar', () => {
    const mockOnTabChange = vi.fn();

    const defaultTabs = [
        { id: 'preview', label: 'Preview' },
        { id: 'code', label: 'Code' },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render all tabs correctly', () => {
        render(
            <TabBar
                tabs={defaultTabs}
                activeTab="preview"
                onTabChange={mockOnTabChange}
            />
        );

        expect(screen.getByText('Preview')).toBeDefined();
        expect(screen.getByText('Code')).toBeDefined();
    });

    it('should show active tab with correct styling', () => {
        render(
            <TabBar
                tabs={defaultTabs}
                activeTab="preview"
                onTabChange={mockOnTabChange}
            />
        );

        const previewTab = screen.getByRole('tab', { name: /preview/i });
        const codeTab = screen.getByRole('tab', { name: /code/i });

        expect(previewTab.getAttribute('aria-selected')).toBe('true');
        expect(codeTab.getAttribute('aria-selected')).toBe('false');
        expect(previewTab.className).toContain('active');
    });

    it('should call onTabChange when tab is clicked', () => {
        render(
            <TabBar
                tabs={defaultTabs}
                activeTab="preview"
                onTabChange={mockOnTabChange}
            />
        );

        const codeTab = screen.getByRole('tab', { name: /code/i });
        fireEvent.click(codeTab);

        expect(mockOnTabChange).toHaveBeenCalledWith('code');
        expect(mockOnTabChange).toHaveBeenCalledTimes(1);
    });

    it('should support keyboard navigation with arrow keys', () => {
        render(
            <TabBar
                tabs={defaultTabs}
                activeTab="preview"
                onTabChange={mockOnTabChange}
            />
        );

        const previewTab = screen.getByRole('tab', { name: /preview/i });

        // Arrow right should move to next tab
        fireEvent.keyDown(previewTab, { key: 'ArrowRight' });
        expect(mockOnTabChange).toHaveBeenCalledWith('code');

        // Arrow left should move to previous tab
        const codeTab = screen.getByRole('tab', { name: /code/i });
        fireEvent.keyDown(codeTab, { key: 'ArrowLeft' });
        expect(mockOnTabChange).toHaveBeenCalledWith('preview');
    });

    it('should support Home and End keys', () => {
        const threeTabs = [
            { id: 'tab1', label: 'Tab 1' },
            { id: 'tab2', label: 'Tab 2' },
            { id: 'tab3', label: 'Tab 3' },
        ];

        render(
            <TabBar
                tabs={threeTabs}
                activeTab="tab2"
                onTabChange={mockOnTabChange}
            />
        );

        const tab2 = screen.getByRole('tab', { name: /tab 2/i });

        // Home key should go to first tab
        fireEvent.keyDown(tab2, { key: 'Home' });
        expect(mockOnTabChange).toHaveBeenCalledWith('tab1');

        // End key should go to last tab
        fireEvent.keyDown(tab2, { key: 'End' });
        expect(mockOnTabChange).toHaveBeenCalledWith('tab3');
    });

    it('should render tabs with icons', () => {
        const tabsWithIcons = [
            { id: 'preview', label: 'Preview', icon: <span data-testid="preview-icon">👁️</span> },
            { id: 'code', label: 'Code', icon: <span data-testid="code-icon">💻</span> },
        ];

        render(
            <TabBar
                tabs={tabsWithIcons}
                activeTab="preview"
                onTabChange={mockOnTabChange}
            />
        );

        expect(screen.getByTestId('preview-icon')).toBeDefined();
        expect(screen.getByTestId('code-icon')).toBeDefined();
    });

    it('should apply custom className if provided', () => {
        const { container } = render(
            <TabBar
                tabs={defaultTabs}
                activeTab="preview"
                onTabChange={mockOnTabChange}
                className="custom-class"
            />
        );

        const tabBar = container.querySelector('.tab-bar');
        expect(tabBar?.className).toContain('custom-class');
    });

    it('should set correct tabIndex for active and inactive tabs', () => {
        render(
            <TabBar
                tabs={defaultTabs}
                activeTab="preview"
                onTabChange={mockOnTabChange}
            />
        );

        const previewTab = screen.getByRole('tab', { name: /preview/i });
        const codeTab = screen.getByRole('tab', { name: /code/i });

        expect(previewTab.getAttribute('tabindex')).toBe('0');
        expect(codeTab.getAttribute('tabindex')).toBe('-1');
    });

    it('should wrap around when navigating past the last tab', () => {
        render(
            <TabBar
                tabs={defaultTabs}
                activeTab="code"
                onTabChange={mockOnTabChange}
            />
        );

        const codeTab = screen.getByRole('tab', { name: /code/i });

        // Arrow right on last tab should wrap to first
        fireEvent.keyDown(codeTab, { key: 'ArrowRight' });
        expect(mockOnTabChange).toHaveBeenCalledWith('preview');
    });

    it('should wrap around when navigating before the first tab', () => {
        render(
            <TabBar
                tabs={defaultTabs}
                activeTab="preview"
                onTabChange={mockOnTabChange}
            />
        );

        const previewTab = screen.getByRole('tab', { name: /preview/i });

        // Arrow left on first tab should wrap to last
        fireEvent.keyDown(previewTab, { key: 'ArrowLeft' });
        expect(mockOnTabChange).toHaveBeenCalledWith('code');
    });
});
