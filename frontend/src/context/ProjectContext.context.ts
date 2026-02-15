import { createContext, useContext } from 'react';
import type { SerializedProjectState, SerializedVersion, FileDiff } from '@ai-app-builder/shared/types';

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
    renameProject: (newName: string) => void;
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
