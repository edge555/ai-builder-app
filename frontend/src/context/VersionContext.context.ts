import { createContext, useContext, type ReactNode } from 'react';
import type {
    SerializedVersion,
    SerializedProjectState,
    FileDiff
} from '@/shared';

/**
 * API configuration for the version context.
 */
export interface ApiConfig {
    baseUrl: string;
}

/**
 * State managed by the VersionContext.
 */
export interface VersionState {
    /** List of all versions for the current project */
    versions: SerializedVersion[];
    /** ID of the current version */
    currentVersionId: string | null;
    /** Whether versions are being loaded */
    isLoadingVersions: boolean;
    /** Whether a revert operation is in progress */
    isReverting: boolean;
    /** Error message for version operations */
    versionError: string | null;
    /** Latest diffs from modification or revert */
    latestDiffs: FileDiff[] | null;
}

/**
 * Actions available through the VersionContext.
 */
export interface VersionActions {
    /** Fetch versions for a project */
    fetchVersions: (projectId: string) => Promise<void>;
    /** Revert to a specific version */
    revertToVersion: (projectId: string, versionId: string) => Promise<SerializedProjectState | null>;
    /** Add a new version to the list */
    addVersion: (version: SerializedVersion) => void;
    /** Set the current version ID */
    setCurrentVersionId: (versionId: string | null) => void;
    /** Set the latest diffs */
    setLatestDiffs: (diffs: FileDiff[] | null) => void;
    /** Clear version error */
    clearVersionError: () => void;
    /** Reset version state */
    resetVersionState: () => void;
}

/**
 * Combined context value type.
 */
export type VersionContextValue = VersionState & VersionActions;

export const VersionContext = createContext<VersionContextValue | null>(null);

/**
 * Props for the VersionProvider component.
 */
export interface VersionProviderProps {
    children: ReactNode;
    apiConfig?: Partial<ApiConfig>;
}

/**
 * Hook to access the version context.
 * Must be used within a VersionProvider.
 */
export function useVersions(): VersionContextValue {
    const context = useContext(VersionContext);
    if (!context) {
        throw new Error('useVersions must be used within a VersionProvider');
    }
    return context;
}
