/**
 * AdminWorkspaceListPage — /admin/:orgId/workspaces
 * Lists all workspaces in the org and provides a link to create new ones.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FUNCTIONS_BASE_URL, SUPABASE_ANON_KEY } from '@/integrations/backend/client';
import { useAuthState } from '@/context/AuthContext.context';
import { AdminLayout } from './AdminLayout';
import './AdminLayout.css';
import './AdminWorkspacePage.css';

interface Workspace {
    id: string;
    name: string;
    created_at: string;
}

export function AdminWorkspaceListPage() {
    const { orgId } = useParams<{ orgId: string }>();
    const { session } = useAuthState();
    const navigate = useNavigate();
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!session || !orgId) return;
        loadWorkspaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.accessToken, orgId]);

    async function loadWorkspaces() {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(`${FUNCTIONS_BASE_URL}/org/${orgId}/workspaces`, {
                headers: {
                    'Authorization': `Bearer ${session!.accessToken}`,
                    'apikey': SUPABASE_ANON_KEY,
                },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setWorkspaces(await res.json());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load workspaces');
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <AdminLayout>
            <div className="admin-page">
                <div className="admin-page-header">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <h1 className="admin-page-title">Workspaces</h1>
                            <p className="admin-page-subtitle">Manage your organization's workspaces and members.</p>
                        </div>
                        <button
                            className="admin-primary-btn"
                            onClick={() => navigate(`/admin/${orgId}/workspaces/new`)}
                        >
                            New workspace
                        </button>
                    </div>
                </div>

                {isLoading && <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem' }}>Loading…</p>}
                {error && <p style={{ color: 'hsl(var(--destructive))', fontSize: '0.875rem' }}>{error}</p>}

                {!isLoading && !error && workspaces.length === 0 && (
                    <div className="admin-empty">
                        <p>No workspaces yet.</p>
                        <button className="admin-primary-btn" onClick={() => navigate(`/admin/${orgId}/workspaces/new`)}>
                            Create your first workspace
                        </button>
                    </div>
                )}

                <div className="admin-workspace-list">
                    {workspaces.map(ws => (
                        <Link
                            key={ws.id}
                            to={`/admin/${orgId}/workspaces/${ws.id}`}
                            className="admin-workspace-card"
                        >
                            <span className="admin-workspace-name">{ws.name}</span>
                            <span className="admin-workspace-meta">
                                Created {new Date(ws.created_at).toLocaleDateString()}
                            </span>
                        </Link>
                    ))}
                </div>
            </div>
        </AdminLayout>
    );
}

export default AdminWorkspaceListPage;
