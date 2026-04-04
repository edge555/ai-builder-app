/**
 * MemberBuilderPage — /w/:workspaceId
 * AI builder for workspace members. Shows a project list or the full builder
 * depending on whether a project is selected (via ?project=:pid query param).
 *
 * Wraps the standard builder stack with WorkspaceProvider so all AI calls
 * use the organization's API key (injected server-side).
 */

import type { SerializedProjectState } from '@ai-app-builder/shared/types';
import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
    ErrorBoundary,
    AppLayout,
} from '@/components';
import {
    ProjectProvider,
    ChatMessagesProvider,
    GenerationProvider,
    AutoRepairProvider,
    PreviewErrorProvider,
    ErrorAggregatorProvider,
} from '@/context';
import { WorkspaceProvider } from '@/context/WorkspaceContext';
import { FUNCTIONS_BASE_URL, SUPABASE_ANON_KEY } from '@/integrations/backend/client';
import { useAuthState } from '@/context/AuthContext.context';
import { useMemberAutoSave } from '@/hooks/useMemberAutoSave';
import { createLogger } from '@/utils/logger';
import './MemberBuilderPage.css';

const logger = createLogger('MemberBuilderPage');

interface WorkspaceProject {
    id: string;
    name: string;
    updated_at: string;
}

// ── Auto-save component (must be inside GenerationProvider + ProjectProvider) ──

function MemberAutoSaveWatcher({ projectId, accessToken }: { projectId: string; accessToken: string }) {
    useMemberAutoSave(projectId, accessToken);
    return null;
}

// ── Project list view ──────────────────────────────────────────────────────────

function ProjectListView({
    workspaceId,
    accessToken,
    onSelectProject,
    onNewProject,
}: {
    workspaceId: string;
    accessToken: string;
    onSelectProject: (pid: string, state: SerializedProjectState | null) => void;
    onNewProject: () => void;
}) {
    const [projects, setProjects] = useState<WorkspaceProject[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openingId, setOpeningId] = useState<string | null>(null);

    useEffect(() => {
        fetch(`${FUNCTIONS_BASE_URL}/member/projects?workspaceId=${workspaceId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'apikey': SUPABASE_ANON_KEY,
            },
        })
            .then(async res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json() as Promise<WorkspaceProject[]>;
            })
            .then(setProjects)
            .catch(e => setError(e instanceof Error ? e.message : 'Failed to load projects'))
            .finally(() => setIsLoading(false));
    }, [workspaceId, accessToken]);

    async function openProject(pid: string) {
        setOpeningId(pid);
        try {
            const res = await fetch(`${FUNCTIONS_BASE_URL}/member/projects/${pid}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'apikey': SUPABASE_ANON_KEY,
                },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json() as {
                id: string;
                name: string;
                updated_at: string;
                files_json: Record<string, { code: string }> | null;
            };
            const state: SerializedProjectState | null = data.files_json
                ? {
                    id: pid,
                    name: data.name || 'Untitled project',
                    description: '',
                    files: Object.fromEntries(
                        Object.entries(data.files_json).map(([path, f]) => [path, f.code])
                    ),
                    createdAt: data.updated_at,
                    updatedAt: data.updated_at,
                    currentVersionId: '',
                  }
                : null;
            onSelectProject(pid, state);
        } catch (e) {
            logger.error('Failed to load project', { error: String(e) });
            setError('Failed to open project');
        } finally {
            setOpeningId(null);
        }
    }

    return (
        <div className="member-list-page">
            <header className="member-list-header">
                <div>
                    <h1 className="member-list-title">My projects</h1>
                    <p className="member-list-subtitle">Build with AI. Your projects are auto-saved.</p>
                </div>
                <button className="member-new-btn" onClick={onNewProject}>
                    + New project
                </button>
            </header>

            {isLoading && <p className="member-list-status">Loading projects…</p>}
            {error && <p className="member-list-status member-list-status--error">{error}</p>}

            {!isLoading && !error && projects.length === 0 && (
                <div className="member-list-empty">
                    <p>No projects yet.</p>
                    <button className="member-new-btn" onClick={onNewProject}>
                        Create your first project
                    </button>
                </div>
            )}

            <div className="member-project-grid">
                {projects.map(p => (
                    <button
                        key={p.id}
                        className="member-project-card"
                        onClick={() => openProject(p.id)}
                        disabled={openingId === p.id}
                    >
                        <span className="member-project-name">{p.name || 'Untitled project'}</span>
                        <span className="member-project-date">
                            {openingId === p.id
                                ? 'Opening…'
                                : `Updated ${new Date(p.updated_at).toLocaleDateString()}`}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}

// ── Builder view ───────────────────────────────────────────────────────────────

function BuilderView({
    workspaceId,
    projectId,
    initialState,
    accessToken,
    onBack,
}: {
    workspaceId: string;
    projectId: string;
    initialState: SerializedProjectState | null;
    accessToken: string;
    onBack: () => void;
}) {
    return (
        <WorkspaceProvider workspaceId={workspaceId} projectId={projectId}>
            <ErrorAggregatorProvider key={projectId}>
                <ProjectProvider initialState={initialState}>
                    <ChatMessagesProvider>
                        <GenerationProvider>
                            <MemberAutoSaveWatcher projectId={projectId} accessToken={accessToken} />
                            <PreviewErrorProvider>
                                <AutoRepairProvider>
                                    <AppLayout
                                        onBackToDashboard={onBack}
                                        disableAutoSave={true}
                                    />
                                </AutoRepairProvider>
                            </PreviewErrorProvider>
                        </GenerationProvider>
                    </ChatMessagesProvider>
                </ProjectProvider>
            </ErrorAggregatorProvider>
        </WorkspaceProvider>
    );
}

// ── Page root ──────────────────────────────────────────────────────────────────

export function MemberBuilderPage() {
    const { workspaceId } = useParams<{ workspaceId: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const { session, isAuthenticated, isLoading: authLoading } = useAuthState();

    const projectParam = searchParams.get('project');

    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projectParam);
    const [selectedProjectState, setSelectedProjectState] = useState<SerializedProjectState | null>(null);
    const [isCreatingProject, setIsCreatingProject] = useState(false);

    useEffect(() => {
        if (!authLoading && !isAuthenticated) {
            navigate('/login', { replace: true });
        }
    }, [authLoading, isAuthenticated, navigate]);

    if (!workspaceId || authLoading || !session) {
        return <div className="member-loading">Loading…</div>;
    }

    async function handleNewProject() {
        if (!session || !workspaceId) return;
        setIsCreatingProject(true);
        try {
            const res = await fetch(`${FUNCTIONS_BASE_URL}/member/projects`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.accessToken}`,
                    'apikey': SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({ workspaceId, name: 'New project' }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const { id } = await res.json() as { id: string };
            setSelectedProjectId(id);
            setSelectedProjectState(null);
            setSearchParams({ project: id });
        } catch (e) {
            logger.error('Failed to create project', { error: String(e) });
        } finally {
            setIsCreatingProject(false);
        }
    }

    function handleSelectProject(pid: string, state: SerializedProjectState | null) {
        setSelectedProjectId(pid);
        setSelectedProjectState(state);
        setSearchParams({ project: pid });
    }

    function handleBack() {
        setSelectedProjectId(null);
        setSelectedProjectState(null);
        setSearchParams({});
    }

    if (isCreatingProject) {
        return <div className="member-loading">Creating project…</div>;
    }

    if (selectedProjectId) {
        return (
            <ErrorBoundary errorMessage="An unexpected error occurred. Please go back and try again.">
                <BuilderView
                    workspaceId={workspaceId}
                    projectId={selectedProjectId}
                    initialState={selectedProjectState}
                    accessToken={session.accessToken}
                    onBack={handleBack}
                />
            </ErrorBoundary>
        );
    }

    return (
        <ProjectListView
            workspaceId={workspaceId}
            accessToken={session.accessToken}
            onSelectProject={handleSelectProject}
            onNewProject={handleNewProject}
        />
    );
}

export default MemberBuilderPage;
