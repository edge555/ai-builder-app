import type { FileDiff } from './diff';

/**
 * Represents an immutable snapshot of the project state.
 * Created after each user prompt to enable version history and undo/revert.
 */
export interface Version {
  /** Unique identifier for this version */
  id: string;
  /** ID of the project this version belongs to */
  projectId: string;
  /** The user prompt that led to this version */
  prompt: string;
  /** Timestamp when this version was created */
  timestamp: Date;
  /** Complete snapshot of all files at this version */
  files: Record<string, string>;
  /** Computed diffs from the previous version */
  diffs: FileDiff[];
  /** ID of the parent version, null for initial version */
  parentVersionId: string | null;
}

/**
 * Serializable version of Version for JSON transport.
 */
export interface SerializedVersion {
  id: string;
  projectId: string;
  prompt: string;
  timestamp: string;
  files: Record<string, string>;
  diffs: FileDiff[];
  parentVersionId: string | null;
}

/**
 * Converts a Version to its serializable form.
 */
export function serializeVersion(version: Version): SerializedVersion {
  return {
    ...version,
    timestamp: version.timestamp.toISOString(),
  };
}

/**
 * Converts a SerializedVersion back to Version.
 */
export function deserializeVersion(serialized: SerializedVersion): Version {
  return {
    ...serialized,
    timestamp: new Date(serialized.timestamp),
  };
}
