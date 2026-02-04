import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
import type {
  SerializedVersion,
  SerializedProjectState,
  GetVersionsResponse,
  RevertVersionResponse,
  FileDiff
} from '@/shared';
import { config as appConfig } from '../config';
import { backend } from '@/integrations/backend/client';

/**
 * API configuration for the version context.
 */
interface ApiConfig {
  baseUrl: string;
}

/**
 * State managed by the VersionContext.
 */
interface VersionState {
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
interface VersionActions {
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
type VersionContextValue = VersionState & VersionActions;

const VersionContext = createContext<VersionContextValue | null>(null);

/**
 * Props for the VersionProvider component.
 */
interface VersionProviderProps {
  children: React.ReactNode;
  apiConfig?: Partial<ApiConfig>;
}


/**
 * Provider component for version state management.
 * Manages version history and handles API calls for fetching versions and reverting.
 * 
 * Requirements: 6.3
 */
export function VersionProvider({ children, apiConfig }: VersionProviderProps) {
  const config = useMemo(() => ({
    baseUrl: appConfig.api.baseUrl,
    ...apiConfig
  }), [apiConfig]);

  const [versions, setVersions] = useState<SerializedVersion[]>([]);
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [latestDiffs, setLatestDiffs] = useState<FileDiff[] | null>(null);
  const isFetchingRef = useRef(false);
  const isRevertingRef = useRef(false);

  /**
   * Fetches all versions for a project from the API.
   */
  const fetchVersions = useCallback(async (projectId: string): Promise<void> => {
    if (isFetchingRef.current) {
      return;
    }
    isFetchingRef.current = true;
    setIsLoadingVersions(true);
    setVersionError(null);

    try {
      const { data, error } = await backend.functions.invoke('versions', {
        body: { projectId },
      });
      if (error) throw new Error(error.message);

      const parsed = data as GetVersionsResponse;
      setVersions(parsed?.versions ?? []);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch versions';
      setVersionError(errorMsg);
    } finally {
      setIsLoadingVersions(false);
      isFetchingRef.current = false;
    }
  }, []);

  /**
   * Reverts to a specific version.
   * Returns the restored project state if successful, null otherwise.
   */
  const revertToVersion = useCallback(async (
    projectId: string,
    versionId: string
  ): Promise<SerializedProjectState | null> => {
    if (isRevertingRef.current) {
      return null;
    }
    isRevertingRef.current = true;
    setIsReverting(true);
    setVersionError(null);

    try {
      const { data, error } = await backend.functions.invoke('revert', {
        body: { projectId, versionId },
      });
      if (error) throw new Error(error.message);

      const parsed = data as RevertVersionResponse;

      if (parsed.success && parsed.projectState && parsed.version) {
        // Add the new revert version to the list
        setVersions((prev) => [...prev, parsed.version!]);
        setCurrentVersionId(parsed.version.id);
        return parsed.projectState;
      } else {
        const errorMsg = parsed.error || 'Failed to revert to version';
        setVersionError(errorMsg);
        return null;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to revert to version';
      setVersionError(errorMsg);
      return null;
    } finally {
      setIsReverting(false);
      isRevertingRef.current = false;
    }
  }, []);

  /**
   * Adds a new version to the list.
   */
  const addVersion = useCallback((version: SerializedVersion) => {
    setVersions((prev) => [...prev, version]);
    setCurrentVersionId(version.id);
  }, []);

  /**
   * Clears the version error.
   */
  const clearVersionError = useCallback(() => {
    setVersionError(null);
  }, []);

  /**
   * Resets all version state.
   */
  const resetVersionState = useCallback(() => {
    setVersions([]);
    setCurrentVersionId(null);
    setVersionError(null);
    setLatestDiffs(null);
  }, []);

  const value = useMemo<VersionContextValue>(() => ({
    versions,
    currentVersionId,
    isLoadingVersions,
    isReverting,
    versionError,
    latestDiffs,
    fetchVersions,
    revertToVersion,
    addVersion,
    setCurrentVersionId,
    setLatestDiffs,
    clearVersionError,
    resetVersionState,
  }), [
    versions,
    currentVersionId,
    isLoadingVersions,
    isReverting,
    versionError,
    latestDiffs,
    fetchVersions,
    revertToVersion,
    setCurrentVersionId,
    setLatestDiffs,
    clearVersionError,
    resetVersionState,
  ]);

  return (
    <VersionContext.Provider value={value}>
      {children}
    </VersionContext.Provider>
  );
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
