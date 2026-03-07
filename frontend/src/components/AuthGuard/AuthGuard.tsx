import { Navigate } from 'react-router-dom';
import { useAuthState } from '@/context/AuthContext.context';
import { PageSkeleton } from '@/components/PageSkeleton/PageSkeleton';

export function AuthGuard({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuthState();

    if (isLoading) return <PageSkeleton />;
    if (!isAuthenticated) return <Navigate to="/login" replace />;

    return <>{children}</>;
}
