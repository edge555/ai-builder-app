/**
 * MemberJoinPage — /join/:token
 * Accept a workspace invite. Requires authentication.
 * On success: redirects to /w/:workspaceId.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FUNCTIONS_BASE_URL, SUPABASE_ANON_KEY } from '@/integrations/backend/client';
import { useAuthState } from '@/context/AuthContext.context';
import './MemberJoinPage.css';

interface InviteDetails {
    workspaceId: string;
    workspaceName: string;
    orgName: string;
    email: string;
}

export function MemberJoinPage() {
    const { token } = useParams<{ token: string }>();
    const { session, isAuthenticated, isLoading: authLoading } = useAuthState();
    const navigate = useNavigate();
    const [invite, setInvite] = useState<InviteDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isAccepting, setIsAccepting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load invite details (no auth required for GET)
    useEffect(() => {
        if (!token) return;
        fetch(`${FUNCTIONS_BASE_URL}/invite/${token}`, {
            headers: { 'apikey': SUPABASE_ANON_KEY },
        })
            .then(async res => {
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error ?? 'Invalid or expired invite link');
                }
                return res.json() as Promise<InviteDetails>;
            })
            .then(setInvite)
            .catch(e => setError(e instanceof Error ? e.message : 'Failed to load invite'))
            .finally(() => setIsLoading(false));
    }, [token]);

    async function handleAccept() {
        if (!session || !token) return;
        setIsAccepting(true);
        setError(null);
        try {
            const res = await fetch(`${FUNCTIONS_BASE_URL}/invite/${token}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.accessToken}`,
                    'apikey': SUPABASE_ANON_KEY,
                },
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error ?? `HTTP ${res.status}`);
            }
            const { workspaceId } = await res.json() as { workspaceId: string };
            navigate(`/w/${workspaceId}`, { replace: true });
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to accept invite');
            setIsAccepting(false);
        }
    }

    if (isLoading || authLoading) {
        return <div className="join-loading">Loading invite…</div>;
    }

    return (
        <div className="join-page">
            <div className="join-card">
                <div className="join-brand">Blank Canvas</div>

                {error && !invite && (
                    <>
                        <h1 className="join-title">Invite not found</h1>
                        <p className="join-subtitle">{error}</p>
                        <Link to="/" className="join-back-link">Go to home</Link>
                    </>
                )}

                {invite && (
                    <>
                        <h1 className="join-title">You're invited!</h1>
                        <p className="join-subtitle">
                            Join <strong>{invite.workspaceName}</strong> at{' '}
                            <strong>{invite.orgName}</strong> on Blank Canvas.
                        </p>

                        {!isAuthenticated ? (
                            <div className="join-login-prompt">
                                <p>You need to sign in before accepting this invite.</p>
                                <Link
                                    to={`/login?redirect=${encodeURIComponent(`/join/${token}`)}`}
                                    className="join-login-btn"
                                >
                                    Sign in to accept
                                </Link>
                            </div>
                        ) : (
                            <>
                                {error && <p className="join-error">{error}</p>}
                                <button
                                    className="join-accept-btn"
                                    onClick={handleAccept}
                                    disabled={isAccepting}
                                >
                                    {isAccepting ? 'Joining…' : 'Accept invitation'}
                                </button>
                                <p className="join-email-note">
                                    Signing in as <strong>{session?.user.email}</strong>.{' '}
                                    This invite is for <strong>{invite.email}</strong>.
                                </p>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default MemberJoinPage;
