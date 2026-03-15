import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
    ChevronLeft: () => <div data-testid="icon-chevron-left" />,
    ChevronRight: () => <div data-testid="icon-chevron-right" />,
    RefreshCw: ({ className }: any) => <div data-testid="icon-refresh" className={className || ''} />,
}));

import { BrowserChrome } from '../BrowserChrome';

describe('BrowserChrome', () => {
    const mockOnRefresh = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render navigation buttons and URL bar', () => {
        render(<BrowserChrome />);

        expect(screen.getByLabelText(/go back/i)).toBeDefined();
        expect(screen.getByLabelText(/go forward/i)).toBeDefined();
        expect(screen.getByLabelText(/refresh preview/i)).toBeDefined();
        expect(screen.getByText(/preview.app/i)).toBeDefined();
    });

    it('should display custom URL if provided', () => {
        render(<BrowserChrome url="https://my-custom-app.com/" />);

        expect(screen.getByText(/my-custom-app.com/i)).toBeDefined();
    });

    it('should call onRefresh when refresh button is clicked', () => {
        render(<BrowserChrome onRefresh={mockOnRefresh} />);

        const refreshButton = screen.getByLabelText(/refresh preview/i);
        fireEvent.click(refreshButton);

        expect(mockOnRefresh).toHaveBeenCalledTimes(1);
    });

    it('should show refreshing state correctly', () => {
        render(<BrowserChrome isRefreshing={true} />);

        const refreshButton = screen.getByLabelText(/refresh preview/i);

        expect(refreshButton.className).toContain('refreshing');
        expect(refreshButton.hasAttribute('disabled')).toBe(true);
    });

    it('should not call onRefresh when refreshing', () => {
        render(<BrowserChrome onRefresh={mockOnRefresh} isRefreshing={true} />);

        const refreshButton = screen.getByLabelText(/refresh preview/i);
        fireEvent.click(refreshButton);

        // Should not be called because button is disabled
        expect(mockOnRefresh).not.toHaveBeenCalled();
    });

    it('should have back and forward buttons disabled', () => {
        render(<BrowserChrome />);

        const backButton = screen.getByLabelText(/go back/i);
        const forwardButton = screen.getByLabelText(/go forward/i);

        expect(backButton.hasAttribute('disabled')).toBe(true);
        expect(forwardButton.hasAttribute('disabled')).toBe(true);
    });

    it('should render lock icon in URL bar', () => {
        const { container } = render(<BrowserChrome />);

        const lockIcon = container.querySelector('.browser-chrome-protocol');
        expect(lockIcon?.textContent).toBe('🔒');
    });

    it('should render all navigation icons', () => {
        render(<BrowserChrome />);

        expect(screen.getByTestId('icon-chevron-left')).toBeDefined();
        expect(screen.getByTestId('icon-chevron-right')).toBeDefined();
        expect(screen.getByTestId('icon-refresh')).toBeDefined();
    });

    it('should use default URL when not provided', () => {
        render(<BrowserChrome />);

        expect(screen.getByText(/https:\/\/preview.app\//i)).toBeDefined();
    });

    it('should apply spin class to refresh icon when refreshing', () => {
        render(<BrowserChrome isRefreshing={true} />);

        const refreshIcon = screen.getByTestId('icon-refresh');
        expect(refreshIcon.className).toContain('spin');
    });

    it('should not apply spin class when not refreshing', () => {
        render(<BrowserChrome isRefreshing={false} />);

        const refreshIcon = screen.getByTestId('icon-refresh');
        expect(refreshIcon.className).not.toContain('spin');
    });
});
