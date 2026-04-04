/**
 * MemberWorkspacePickerPage — /w
 * Shown when a user belongs to multiple workspaces. Reads workspace_ids from
 * Supabase user_metadata and shows links to each workspace.
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthState } from '@/context/AuthContext.context';
import './MemberWorkspacePickerPage.css';

export function MemberWorkspacePickerPage() {
    const { isAuthenticated, isLoading: authLoading } = useAuthState();
    const navigate = useNavigate();
    const [workspaceIds, setWorkspaceIds] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (authLoading) return;
        if (!isAuthenticated) {
            navigate('/login', { replace: true });
            return;
        }

        async function load() {
            if (!supabase) { setIsLoading(false); return; }
            const { data: { session } } = await supabase.auth.getSession();
            const ids: string[] = session?.user?.user_metadata?.workspace_ids ?? [];
            if (ids.length === 1) {
                navigate(`/w/${ids[0]}`, { replace: true });
                return;
            }
            setWorkspaceIds(ids);
            setIsLoading(false);
        }

        load();
    }, [authLoading, isAuthenticated, navigate]);

    if (isLoading || authLoading) {
        return <div className="picker-loading">Loading workspaces…</div>;
    }

    return (
        <div className="picker-page">
            <div className="picker-card">
                <div className="picker-brand">Blank Canvas</div>
                <h1 className="picker-title">Your workspaces</h1>
                <p className="picker-subtitle">Select a workspace to open the builder.</p>

                {workspaceIds.length === 0 ? (
                    <p className="picker-empty">
                        You haven't joined any workspaces yet.{' '}
                        Use the invite link from your instructor to get started.
                    </p>
                ) : (
                    <div className="picker-list">
                        {workspaceIds.map(wid => (
                            <Link key={wid} to={`/w/${wid}`} className="picker-workspace-link">
                                Workspace {wid.slice(0, 8)}…
                            </Link>
                        ))}
                    </div>
                )}

                <Link to="/" className="picker-back-link">← Back to main app</Link>
            </div>
        </div>
    );
}

export default MemberWorkspacePickerPage;
