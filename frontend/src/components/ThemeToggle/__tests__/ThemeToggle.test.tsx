import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ThemeToggle } from '../ThemeToggle';

describe('ThemeToggle', () => {
    beforeEach(() => {
        // Clear localStorage before each test
        localStorage.clear();
        // Reset document.documentElement attributes
        document.documentElement.removeAttribute('data-theme');
        vi.clearAllMocks();
    });

    it('should render with sun icon in dark mode', () => {
        localStorage.setItem('theme', 'dark');
        render(<ThemeToggle />);

        const button = screen.getByRole('button', { name: /switch to light mode/i });
        expect(button).toBeInTheDocument();
        expect(button).toHaveAttribute('aria-label', 'Switch to light mode');
    });

    it('should render with moon icon in light mode', () => {
        localStorage.setItem('theme', 'light');
        render(<ThemeToggle />);

        const button = screen.getByRole('button', { name: /switch to dark mode/i });
        expect(button).toBeInTheDocument();
        expect(button).toHaveAttribute('aria-label', 'Switch to dark mode');
    });

    it('should toggle theme from light to dark on click', () => {
        localStorage.setItem('theme', 'light');
        render(<ThemeToggle />);

        const button = screen.getByRole('button');
        fireEvent.click(button);

        expect(localStorage.getItem('theme')).toBe('dark');
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        expect(button).toHaveAttribute('aria-label', 'Switch to light mode');
    });

    it('should toggle theme from dark to light on click', () => {
        localStorage.setItem('theme', 'dark');
        render(<ThemeToggle />);

        const button = screen.getByRole('button');
        fireEvent.click(button);

        expect(localStorage.getItem('theme')).toBe('light');
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        expect(button).toHaveAttribute('aria-label', 'Switch to dark mode');
    });

    it('should persist theme preference to localStorage', () => {
        render(<ThemeToggle />);

        const button = screen.getByRole('button');
        fireEvent.click(button);

        expect(localStorage.getItem('theme')).toBeTruthy();
    });

    it('should respect system preference when no saved theme', () => {
        // Mock matchMedia to return dark mode preference
        window.matchMedia = vi.fn().mockImplementation((query) => ({
            matches: query === '(prefers-color-scheme: dark)',
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));

        render(<ThemeToggle />);

        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('should default to light theme when no preference', () => {
        // Mock matchMedia to return no dark mode preference
        window.matchMedia = vi.fn().mockImplementation((query) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));

        render(<ThemeToggle />);

        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('should apply data-theme attribute to html element', () => {
        localStorage.setItem('theme', 'dark');
        render(<ThemeToggle />);

        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('should have correct title attribute', () => {
        localStorage.setItem('theme', 'light');
        render(<ThemeToggle />);

        const button = screen.getByRole('button');
        expect(button).toHaveAttribute('title', 'Switch to dark mode');

        fireEvent.click(button);
        expect(button).toHaveAttribute('title', 'Switch to light mode');
    });
});
