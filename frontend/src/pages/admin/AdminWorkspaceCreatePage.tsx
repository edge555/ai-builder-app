/**
 * AdminWorkspaceCreatePage — /admin/:orgId/workspaces/new
 * Form to create a new workspace in the org.
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FUNCTIONS_BASE_URL, SUPABASE_ANON_KEY } from '@/integrations/backend/client';
import { useAuthState } from '@/context/AuthContext.context';
import { AdminLayout } from './AdminLayout';
import './AdminLayout.css';
import './AdminWorkspacePage.css';

export function AdminWorkspaceCreatePage() {
    const { orgId } = useParams<{ orgId: string }>();
    const { session } = useAuthState();
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!session || !orgId || !name.trim()) return;
        setIsSaving(true);
        setError(null);
        try {
            const res = await fetch(`${FUNCTIONS_BASE_URL}/org/${orgId}/workspaces`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.accessToken}`,
                    'apikey': SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({ name: name.trim() }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error ?? `HTTP ${res.status}`);
            }
            const { id } = await res.json() as { id: string };
            navigate(`/admin/${orgId}/workspaces/${id}`, { replace: true });
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to create workspace');
            setIsSaving(false);
        }
    }

    return (
        <AdminLayout>
            <div className="admin-page">
                <div className="admin-page-header">
                    <h1 className="admin-page-title">New workspace</h1>
                    <p className="admin-page-subtitle">Create a workspace to invite members.</p>
                </div>

                <form onSubmit={handleSubmit} className="admin-form">
                    <div className="admin-field">
                        <label className="admin-label" htmlFor="ws-name">Workspace name</label>
                        <input
                            id="ws-name"
                            className="admin-input"
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. CS101 Spring 2026"
                            maxLength={200}
                            required
                            autoFocus
                        />
                    </div>

                    {error && <p className="admin-error">{error}</p>}

                    <div className="admin-form-actions">
                        <button
                            type="button"
                            className="admin-secondary-btn"
                            onClick={() => navigate(-1)}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="admin-primary-btn"
                            disabled={isSaving || !name.trim()}
                        >
                            {isSaving ? 'Creating…' : 'Create workspace'}
                        </button>
                    </div>
                </form>
            </div>
        </AdminLayout>
    );
}

export default AdminWorkspaceCreatePage;
