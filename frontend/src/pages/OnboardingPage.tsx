/**
 * OnboardingPage — /onboarding
 * Idempotent self-provision: creates Org + Workspace for the current user.
 * If the user already has an org, returns the existing orgId and redirects.
 */

import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { FUNCTIONS_BASE_URL, SUPABASE_ANON_KEY } from '@/integrations/backend/client';
import { useAuthState } from '@/context/AuthContext.context';
import './OnboardingPage.css';

export function OnboardingPage() {
    const { session, isAuthenticated, isLoading: authLoading } = useAuthState();
    const navigate = useNavigate();
    const [isProvisioning, setIsProvisioning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Auto-provision on mount for authenticated users
    useEffect(() => {
        if (authLoading || !isAuthenticated || !session) return;
        provision(session.accessToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, isAuthenticated, session?.accessToken]);

    async function provision(accessToken: string) {
        setIsProvisioning(true);
        setError(null);
        try {
            const res = await fetch(`${FUNCTIONS_BASE_URL}/org/self-provision`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                    'apikey': SUPABASE_ANON_KEY,
                },
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error ?? `HTTP ${res.status}`);
            }
            const { orgId } = await res.json() as { orgId: string; workspaceId: string };
            navigate(`/admin/${orgId}/workspaces`, { replace: true });
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to set up your workspace');
            setIsProvisioning(false);
        }
    }

    if (authLoading) {
        return <div className="onboarding-loading">Loading…</div>;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return (
        <div className="onboarding-page">
            <div className="onboarding-card">
                <h1 className="onboarding-title">Setting up your workspace</h1>
                <p className="onboarding-subtitle">
                    We're creating your organization and first workspace. This only takes a moment.
                </p>

                {isProvisioning && (
                    <div className="onboarding-spinner" aria-label="Setting up…" />
                )}

                {error && (
                    <div className="onboarding-error">
                        <p>{error}</p>
                        <button
                            className="onboarding-retry-btn"
                            onClick={() => session && provision(session.accessToken)}
                        >
                            Try again
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default OnboardingPage;
