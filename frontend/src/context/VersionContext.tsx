import { useState, useCallback, useMemo, useRef } from 'react';
import type {
  SerializedVersion,
  SerializedProjectState,
  GetVersionsResponse,
  RevertVersionResponse,
  FileDiff
} from '@ai-app-builder/shared/types';
import { backend } from '@/integrations/backend/client';

import { VersionContext, type VersionProviderProps, type VersionContextValue } from './VersionContext.context';



/**
 * Provider component for version state management.
 * Manages version history and handles API calls for fetching versions and reverting.
 * 
 * Requirements: 6.3
 */
export function VersionProvider({ children }: VersionProviderProps) {

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

