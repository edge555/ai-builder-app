import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OnboardingOverlay } from '../OnboardingOverlay';

// jsdom doesn't implement HTMLDialogElement.showModal/close — stub them
HTMLDialogElement.prototype.showModal = vi.fn();
HTMLDialogElement.prototype.close = vi.fn();

describe('OnboardingOverlay', () => {
  const defaultProps = {
    onDismiss: vi.fn(),
    onGeneratePrompt: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset showModal/close mocks so open state is correct
    (HTMLDialogElement.prototype.showModal as ReturnType<typeof vi.fn>).mockClear();
    (HTMLDialogElement.prototype.close as ReturnType<typeof vi.fn>).mockClear();
  });

  describe('Step 1 — project type selection', () => {
    it('renders step 1 with project type choices', () => {
      render(<OnboardingOverlay {...defaultProps} />);
      expect(screen.getByText('What are you building?')).toBeTruthy();
      expect(screen.getByText('Single Page App')).toBeTruthy();
      expect(screen.getByText('Dashboard')).toBeTruthy();
    });

    it('Next button is disabled when no project type is selected', () => {
      render(<OnboardingOverlay {...defaultProps} />);
      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeDisabled();
    });

    it('Next button is enabled after a project type is selected', () => {
      render(<OnboardingOverlay {...defaultProps} />);
      fireEvent.click(screen.getByText('Dashboard'));
      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).not.toBeDisabled();
    });

    it('advances to step 2 when Next is clicked with a selection', () => {
      render(<OnboardingOverlay {...defaultProps} />);
      fireEvent.click(screen.getByText('Dashboard'));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      expect(screen.getByText('Add features')).toBeTruthy();
    });
  });

  describe('design style labels (Step 3)', () => {
    function advanceToStep3() {
      // Step 1: pick a type and advance
      fireEvent.click(screen.getByText('Single Page App'));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      // Step 2: advance without picking features
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
    }

    it('shows renamed style labels on step 3', () => {
      render(<OnboardingOverlay {...defaultProps} />);
      advanceToStep3();
      expect(screen.getByText('Editorial')).toBeTruthy();
      expect(screen.getByText('Energetic')).toBeTruthy();
      expect(screen.getByText('Polished')).toBeTruthy();
    });

    it('does not show old generic labels on step 3', () => {
      render(<OnboardingOverlay {...defaultProps} />);
      advanceToStep3();
      expect(screen.queryByText('Minimal')).toBeNull();
      expect(screen.queryByText('Colorful')).toBeNull();
      expect(screen.queryByText('Professional')).toBeNull();
    });
  });

  describe('backdrop click dismissal', () => {
    it('calls onDismiss when clicking the dialog backdrop (target is the dialog itself)', () => {
      render(<OnboardingOverlay {...defaultProps} />);
      const dialog = document.querySelector('dialog')!;
      // Simulate a click where event.target === dialog (backdrop click)
      fireEvent.click(dialog, { target: dialog });
      expect(defaultProps.onDismiss).toHaveBeenCalled();
    });

    it('does NOT dismiss when clicking inside the dialog content', () => {
      render(<OnboardingOverlay {...defaultProps} />);
      const content = screen.getByText('What are you building?');
      fireEvent.click(content);
      expect(defaultProps.onDismiss).not.toHaveBeenCalled();
    });
  });

  describe('skip link', () => {
    it('calls onDismiss when skip link is clicked', () => {
      render(<OnboardingOverlay {...defaultProps} />);
      fireEvent.click(screen.getByText(/skip/i));
      expect(defaultProps.onDismiss).toHaveBeenCalled();
    });
  });
});
