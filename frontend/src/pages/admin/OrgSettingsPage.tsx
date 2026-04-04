/**
 * OrgSettingsPage — /admin/:orgId/settings
 * Manage organization name and AI API key.
 */

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { FUNCTIONS_BASE_URL, SUPABASE_ANON_KEY } from '@/integrations/backend/client';
import { useAuthState } from '@/context/AuthContext.context';
import { AdminLayout } from './AdminLayout';
import './AdminLayout.css';
import './AdminWorkspacePage.css';

interface OrgSettings {
    name: string;
    api_key_set: boolean;
}

export function OrgSettingsPage() {
    const { orgId } = useParams<{ orgId: string }>();
    const { session } = useAuthState();
    const [settings, setSettings] = useState<OrgSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [name, setName] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [savedMsg, setSavedMsg] = useState<string | null>(null);

    useEffect(() => {
        if (!session || !orgId) return;
        loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.accessToken, orgId]);

    async function loadSettings() {
        setIsLoading(true);
        try {
            const res = await fetch(`${FUNCTIONS_BASE_URL}/org/${orgId}/settings`, {
                headers: {
                    'Authorization': `Bearer ${session!.accessToken}`,
                    'apikey': SUPABASE_ANON_KEY,
                },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json() as OrgSettings;
            setSettings(data);
            setName(data.name);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load settings');
        } finally {
            setIsLoading(false);
        }
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!session || !orgId) return;
        setIsSaving(true);
        setError(null);
        setSavedMsg(null);
        try {
            const body: Record<string, string> = { name: name.trim() };
            if (apiKey.trim()) body.api_key = apiKey.trim();

            const res = await fetch(`${FUNCTIONS_BASE_URL}/org/${orgId}/settings`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.accessToken}`,
                    'apikey': SUPABASE_ANON_KEY,
                },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error ?? `HTTP ${res.status}`);
            }
            setSavedMsg('Settings saved.');
            setApiKey(''); // Clear key field after save — never re-show the actual key
            loadSettings();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to save settings');
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <AdminLayout orgName={settings?.name}>
            <div className="admin-page">
                <div className="admin-page-header">
                    <h1 className="admin-page-title">Settings</h1>
                    <p className="admin-page-subtitle">Organization name and AI provider key.</p>
                </div>

                {isLoading && <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem' }}>Loading…</p>}

                {!isLoading && (
                    <form onSubmit={handleSave} className="admin-form">
                        <div className="admin-field">
                            <label className="admin-label" htmlFor="org-name">Organization name</label>
                            <input
                                id="org-name"
                                className="admin-input"
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                maxLength={200}
                                required
                            />
                        </div>

                        <div className="admin-field">
                            <label className="admin-label" htmlFor="api-key">
                                OpenRouter API key
                                {settings?.api_key_set && (
                                    <span style={{ marginLeft: 8, fontWeight: 400, color: 'hsl(var(--success))' }}>
                                        (key is set)
                                    </span>
                                )}
                            </label>
                            <input
                                id="api-key"
                                className="admin-input"
                                type="password"
                                value={apiKey}
                                onChange={e => setApiKey(e.target.value)}
                                placeholder={settings?.api_key_set ? 'Enter new key to replace' : 'sk-or-…'}
                                autoComplete="new-password"
                            />
                            <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))' }}>
                                Members use this key for AI generation. Leave blank to keep the current key.
                            </p>
                        </div>

                        {error && <p className="admin-error">{error}</p>}
                        {savedMsg && (
                            <p style={{ fontSize: '0.875rem', color: 'hsl(var(--success))' }}>{savedMsg}</p>
                        )}

                        <div className="admin-form-actions">
                            <button type="submit" className="admin-primary-btn" disabled={isSaving}>
                                {isSaving ? 'Saving…' : 'Save settings'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </AdminLayout>
    );
}

export default OrgSettingsPage;
