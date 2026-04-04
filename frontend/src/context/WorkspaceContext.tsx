/**
 * WorkspaceContext
 * Provides workspaceId and projectId to GenerationContext so workspace API keys
 * are injected into all generate/modify requests when in member builder mode.
 * Null values mean the standard (non-workspace) API key path is used.
 */

import { createContext, useContext, type ReactNode } from 'react';

interface WorkspaceContextValue {
    workspaceId: string | null;
    projectId: string | null;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
    workspaceId: null,
    projectId: null,
});

export function WorkspaceProvider({
    workspaceId,
    projectId,
    children,
}: {
    workspaceId: string;
    projectId?: string | null;
    children: ReactNode;
}) {
    return (
        <WorkspaceContext.Provider value={{ workspaceId, projectId: projectId ?? null }}>
            {children}
        </WorkspaceContext.Provider>
    );
}

export function useWorkspace(): WorkspaceContextValue {
    return useContext(WorkspaceContext);
}
