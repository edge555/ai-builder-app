/**
 * Represents the in-memory state of a generated project.
 * Contains all files as a path-to-content mapping without filesystem mutation.
 */
export interface ProjectState {
  /** Unique identifier for the project */
  id: string;
  /** Human-readable project name */
  name: string;
  /** Description of the project */
  description: string;
  /** Map of file paths to file contents */
  files: Record<string, string>;
  /** Timestamp when the project was created */
  createdAt: Date;
  /** Timestamp when the project was last updated */
  updatedAt: Date;
  /** ID of the current version */
  currentVersionId: string;
}

/**
 * Serializable version of ProjectState for JSON transport.
 * Dates are represented as ISO strings.
 */
export interface SerializedProjectState {
  id: string;
  name: string;
  description: string;
  files: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  currentVersionId: string;
}

/**
 * Converts a ProjectState to its serializable form.
 */
export function serializeProjectState(state: ProjectState): SerializedProjectState {
  return {
    ...state,
    createdAt: state.createdAt.toISOString(),
    updatedAt: state.updatedAt.toISOString(),
  };
}

/**
 * Converts a SerializedProjectState back to ProjectState.
 */
export function deserializeProjectState(serialized: SerializedProjectState): ProjectState {
  return {
    ...serialized,
    createdAt: new Date(serialized.createdAt),
    updatedAt: new Date(serialized.updatedAt),
  };
}
