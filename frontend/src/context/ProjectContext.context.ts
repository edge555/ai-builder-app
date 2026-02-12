import { createContext, useContext, type ReactNode } from 'react';
import type { SerializedProjectState, SerializedVersion, FileDiff } from '@/shared';

/**
 * Callbacks for version integration.
 */
export interface VersionCallbacks {
    onVersionCreated?: (version: SerializedVersion) => void;
    onDiffsComputed?: (diffs: FileDiff[]) => void;
    onProjectStateChanged?: (projectState: SerializedProjectState) => void;
}

/**
 * Project context value.
 */
export interface ProjectContextValue {
    projectState: SerializedProjectState | null;
    setProjectState: (projectState: SerializedProjectState | null, saveToUndo?: boolean) => void;
    setVersionCallbacks: (callbacks: VersionCallbacks) => void;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}

export const ProjectContext = createContext<ProjectContextValue | null>(null);

/**
 * Hook to access the project context.
 * Must be used within a ProjectProvider.
 */
export function useProject(): ProjectContextValue {
    const context = useContext(ProjectContext);
    if (!context) {
        throw new Error('useProject must be used within a ProjectProvider');
    }
    return context;
}
