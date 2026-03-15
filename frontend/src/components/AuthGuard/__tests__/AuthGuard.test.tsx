import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthGuard } from '../AuthGuard';

// Mock react-router-dom Navigate
vi.mock('react-router-dom', () => ({
    Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
}));

// Mock PageSkeleton
vi.mock('@/components/PageSkeleton/PageSkeleton', () => ({
    PageSkeleton: () => <div data-testid="page-skeleton" />,
}));

// Mock useAuthState
vi.mock('@/context/AuthContext.context', () => ({
    useAuthState: vi.fn(),
}));

import { useAuthState } from '@/context/AuthContext.context';

describe('AuthGuard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows PageSkeleton while loading', () => {
        vi.mocked(useAuthState).mockReturnValue({
            isLoading: true,
            isAuthenticated: false,
            user: null,
            session: null,
        });

        render(
            <AuthGuard>
                <div data-testid="child">Protected content</div>
            </AuthGuard>
        );

        expect(screen.getByTestId('page-skeleton')).toBeInTheDocument();
        expect(screen.queryByTestId('child')).not.toBeInTheDocument();
    });

    it('redirects to /login when not authenticated', () => {
        vi.mocked(useAuthState).mockReturnValue({
            isLoading: false,
            isAuthenticated: false,
            user: null,
            session: null,
        });

        render(
            <AuthGuard>
                <div data-testid="child">Protected content</div>
            </AuthGuard>
        );

        const navigate = screen.getByTestId('navigate');
        expect(navigate).toBeInTheDocument();
        expect(navigate.getAttribute('data-to')).toBe('/login');
        expect(screen.queryByTestId('child')).not.toBeInTheDocument();
    });

    it('renders children when authenticated', () => {
        vi.mocked(useAuthState).mockReturnValue({
            isLoading: false,
            isAuthenticated: true,
            user: { id: 'user-1', email: 'test@example.com' } as any,
            session: null,
        });

        render(
            <AuthGuard>
                <div data-testid="child">Protected content</div>
            </AuthGuard>
        );

        expect(screen.getByTestId('child')).toBeInTheDocument();
        expect(screen.queryByTestId('page-skeleton')).not.toBeInTheDocument();
        expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    });

    it('loading state takes priority over unauthenticated redirect', () => {
        vi.mocked(useAuthState).mockReturnValue({
            isLoading: true,
            isAuthenticated: false,
            user: null,
            session: null,
        });

        render(
            <AuthGuard>
                <div data-testid="child">Protected content</div>
            </AuthGuard>
        );

        expect(screen.getByTestId('page-skeleton')).toBeInTheDocument();
        expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    });

    it('renders multiple children when authenticated', () => {
        vi.mocked(useAuthState).mockReturnValue({
            isLoading: false,
            isAuthenticated: true,
            user: { id: 'user-1', email: 'test@example.com' } as any,
            session: null,
        });

        render(
            <AuthGuard>
                <div data-testid="child-1">First</div>
                <div data-testid="child-2">Second</div>
            </AuthGuard>
        );

        expect(screen.getByTestId('child-1')).toBeInTheDocument();
        expect(screen.getByTestId('child-2')).toBeInTheDocument();
    });
});
