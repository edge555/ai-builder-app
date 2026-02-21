import type { SerializedProjectState, SerializedVersion, FileDiff } from '@ai-app-builder/shared/types';
import { createContext, useContext } from 'react';

/**
 * Callbacks for version integration.
 */
export interface VersionCallbacks {
    onVersionCreated?: (version: SerializedVersion) => void;
    onDiffsComputed?: (diffs: FileDiff[]) => void;
    onProjectStateChanged?: (projectState: SerializedProjectState) => void;
}

/**
 * Read-only project state.
 * Components subscribing to this context will only re-render when state changes.
 */
export interface ProjectStateValue {
    projectState: SerializedProjectState | null;
    canUndo: boolean;
    canRedo: boolean;
}

/**
 * Stable project actions.
 * Components subscribing to this context won't re-render on state changes.
 */
export interface ProjectActionsValue {
    setProjectState: (projectState: SerializedProjectState | null, saveToUndo?: boolean) => void;
    setVersionCallbacks: (callbacks: VersionCallbacks) => void;
    renameProject: (newName: string) => void;
    undo: () => void;
    redo: () => void;
}

/**
 * Combined project context value (for backward compatibility).
 */
export interface ProjectContextValue extends ProjectStateValue, ProjectActionsValue {}

export const ProjectStateContext = createContext<ProjectStateValue | null>(null);
export const ProjectActionsContext = createContext<ProjectActionsValue | null>(null);
export const ProjectContext = createContext<ProjectContextValue | null>(null);

/**
 * Hook to access project state only.
 * Components using this won't re-render when actions change.
 */
export function useProjectState(): ProjectStateValue {
    const context = useContext(ProjectStateContext);
    if (!context) {
        throw new Error('useProjectState must be used within a ProjectProvider');
    }
    return context;
}

/**
 * Hook to access project actions only.
 * Components using this won't re-render when state changes.
 */
export function useProjectActions(): ProjectActionsValue {
    const context = useContext(ProjectActionsContext);
    if (!context) {
        throw new Error('useProjectActions must be used within a ProjectProvider');
    }
    return context;
}

/**
 * Hook to access the full project context (state + actions).
 * Must be used within a ProjectProvider.
 * @deprecated Prefer using useProjectState() or useProjectActions() to reduce re-renders.
 */
export function useProject(): ProjectContextValue {
    const context = useContext(ProjectContext);
    if (!context) {
        throw new Error('useProject must be used within a ProjectProvider');
    }
    return context;
}
