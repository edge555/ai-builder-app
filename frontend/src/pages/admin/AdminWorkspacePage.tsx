/**
 * AdminWorkspacePage — /admin/:orgId/workspaces/:wid
 * Members list with invite modal and remove action.
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FUNCTIONS_BASE_URL, SUPABASE_ANON_KEY } from '@/integrations/backend/client';
import { useAuthState } from '@/context/AuthContext.context';
import { AdminLayout } from './AdminLayout';
import './AdminWorkspacePage.css';

interface Member {
    id: string;
    email: string;
    display_name: string;
    joined_at: string | null;
    created_at: string;
    status: 'joined' | 'pending' | 'expired';
}

export function AdminWorkspacePage() {
    const { orgId, wid } = useParams<{ orgId: string; wid: string }>();
    const { session } = useAuthState();
    const [members, setMembers] = useState<Member[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteDisplayName, setInviteDisplayName] = useState('');
    const [isInviting, setIsInviting] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [removingId, setRemovingId] = useState<string | null>(null);

    useEffect(() => {
        if (!session || !orgId || !wid) return;
        loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.accessToken, orgId, wid]);

    async function loadMembers() {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(`${FUNCTIONS_BASE_URL}/org/${orgId}/workspaces/${wid}/members`, {
                headers: {
                    'Authorization': `Bearer ${session!.accessToken}`,
                    'apikey': SUPABASE_ANON_KEY,
                },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setMembers(await res.json());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load members');
        } finally {
            setIsLoading(false);
        }
    }

    async function handleInvite(e: React.FormEvent) {
        e.preventDefault();
        if (!session || !orgId || !wid) return;
        setIsInviting(true);
        setInviteError(null);
        try {
            const res = await fetch(`${FUNCTIONS_BASE_URL}/org/${orgId}/workspaces/${wid}/members`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.accessToken}`,
                    'apikey': SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({ email: inviteEmail.trim(), display_name: inviteDisplayName.trim() }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error ?? `HTTP ${res.status}`);
            }
            setShowInviteModal(false);
            setInviteEmail('');
            setInviteDisplayName('');
            loadMembers();
        } catch (e) {
            setInviteError(e instanceof Error ? e.message : 'Failed to invite member');
        } finally {
            setIsInviting(false);
        }
    }

    async function handleRemove(memberId: string) {
        if (!session || !orgId || !wid) return;
        setRemovingId(memberId);
        try {
            const res = await fetch(`${FUNCTIONS_BASE_URL}/org/${orgId}/workspaces/${wid}/members`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.accessToken}`,
                    'apikey': SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({ memberId }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setMembers(prev => prev.filter(m => m.id !== memberId));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to remove member');
        } finally {
            setRemovingId(null);
        }
    }

    function statusLabel(status: Member['status']) {
        if (status === 'joined') return <span className="member-badge member-badge--joined">Joined</span>;
        if (status === 'pending') return <span className="member-badge member-badge--pending">Pending</span>;
        return <span className="member-badge member-badge--expired">Expired</span>;
    }

    return (
        <AdminLayout>
            <div className="admin-page">
                <div className="admin-page-header">
                    <div className="workspace-page-header-row">
                        <div>
                            <p className="workspace-breadcrumb">
                                <Link to={`/admin/${orgId}/workspaces`}>Workspaces</Link>
                                {' / '}
                                Members
                            </p>
                            <h1 className="admin-page-title">Members</h1>
                        </div>
                        <button
                            className="admin-primary-btn"
                            onClick={() => setShowInviteModal(true)}
                        >
                            Invite member
                        </button>
                    </div>
                </div>

                {isLoading && <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem' }}>Loading…</p>}
                {error && <p style={{ color: 'hsl(var(--destructive))', fontSize: '0.875rem' }}>{error}</p>}

                {!isLoading && members.length === 0 && (
                    <div className="admin-empty">
                        <p>No members yet. Invite someone to get started.</p>
                    </div>
                )}

                {members.length > 0 && (
                    <table className="member-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Status</th>
                                <th>Added</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {members.map(m => (
                                <tr key={m.id}>
                                    <td className="member-name">{m.display_name}</td>
                                    <td className="member-email">{m.email}</td>
                                    <td>{statusLabel(m.status)}</td>
                                    <td className="member-date">
                                        {new Date(m.created_at).toLocaleDateString()}
                                    </td>
                                    <td>
                                        <button
                                            className="member-remove-btn"
                                            onClick={() => handleRemove(m.id)}
                                            disabled={removingId === m.id}
                                            aria-label={`Remove ${m.display_name}`}
                                        >
                                            {removingId === m.id ? '…' : 'Remove'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {showInviteModal && (
                <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <h2 className="modal-title">Invite member</h2>
                        <p className="modal-subtitle">They'll receive an email with an invite link.</p>

                        <form onSubmit={handleInvite} className="admin-form">
                            <div className="admin-field">
                                <label className="admin-label" htmlFor="inv-name">Full name</label>
                                <input
                                    id="inv-name"
                                    className="admin-input"
                                    type="text"
                                    value={inviteDisplayName}
                                    onChange={e => setInviteDisplayName(e.target.value)}
                                    placeholder="Jane Smith"
                                    maxLength={200}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="admin-field">
                                <label className="admin-label" htmlFor="inv-email">Email address</label>
                                <input
                                    id="inv-email"
                                    className="admin-input"
                                    type="email"
                                    value={inviteEmail}
                                    onChange={e => setInviteEmail(e.target.value)}
                                    placeholder="jane@example.com"
                                    required
                                />
                            </div>

                            {inviteError && <p className="admin-error">{inviteError}</p>}

                            <div className="admin-form-actions">
                                <button
                                    type="button"
                                    className="admin-secondary-btn"
                                    onClick={() => setShowInviteModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="admin-primary-btn"
                                    disabled={isInviting}
                                >
                                    {isInviting ? 'Sending…' : 'Send invite'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
}

export default AdminWorkspacePage;
