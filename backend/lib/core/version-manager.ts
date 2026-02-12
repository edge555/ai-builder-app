/**
 * Version Manager Service
 * Manages immutable version snapshots for project state history.
 * Implements Requirements 1.6, 2.2, 2.3, 6.1, 6.2, 6.4
 */

import { v4 as uuidv4 } from 'uuid';
import type { Version, ProjectState, FileDiff } from '@ai-app-builder/shared';
import { getDiffEngine } from '../diff/diff-engine';

/**
 * Options for creating a new version.
 */
export interface CreateVersionOptions {
  /** The project state to snapshot */
  projectState: ProjectState;
  /** The user prompt that led to this version */
  prompt: string;
  /** Computed diffs from the previous version */
  diffs: FileDiff[];
  /** ID of the parent version (null for initial version) */
  parentVersionId: string | null;
}

/**
 * Result of an undo or revert operation.
 */
export interface UndoRevertResult {
  /** Whether the operation was successful */
  success: boolean;
  /** The restored project state (if successful) */
  projectState?: ProjectState;
  /** The new version representing the undo/revert (if successful) */
  version?: Version;
  /** Error message (if unsuccessful) */
  error?: string;
}

/**
 * Version Manager service for managing project version history.
 * Stores versions in-memory, organized by project ID.
 */
export class VersionManager {
  /** In-memory storage: projectId -> versionId -> Version */
  private readonly versionsByProject: Map<string, Map<string, Version>>;

  constructor() {
    this.versionsByProject = new Map();
  }

  /**
   * Creates a new immutable version snapshot.
   * Requirements: 1.6, 2.2
   */
  createVersion(options: CreateVersionOptions): Version {
    const { projectState, prompt, diffs, parentVersionId } = options;

    const version: Version = {
      id: uuidv4(),
      projectId: projectState.id,
      prompt,
      timestamp: new Date(),
      files: { ...projectState.files }, // Create a snapshot copy
      diffs,
      parentVersionId,
    };

    // Get or create the project's version map
    let projectVersions = this.versionsByProject.get(projectState.id);
    if (!projectVersions) {
      projectVersions = new Map();
      this.versionsByProject.set(projectState.id, projectVersions);
    }

    // Store the version (immutable - never modified after creation)
    projectVersions.set(version.id, version);

    return version;
  }

  /**
   * Retrieves a specific version by ID.
   * Returns null if the version doesn't exist.
   */
  getVersion(projectId: string, versionId: string): Version | null {
    const projectVersions = this.versionsByProject.get(projectId);
    if (!projectVersions) {
      return null;
    }

    return projectVersions.get(versionId) ?? null;
  }

  /**
   * Searches all projects for a version ID.
   * Returns the project and version if found.
   */
  findVersion(versionId: string): { projectId: string; version: Version } | null {
    for (const [projectId, projectVersions] of this.versionsByProject.entries()) {
      const version = projectVersions.get(versionId);
      if (version) {
        return { projectId, version };
      }
    }

    return null;
  }

  /**
   * Retrieves all versions for a project, ordered by timestamp (oldest first).
   * Requirements: 2.3
   */
  getAllVersions(projectId: string): Version[] {
    const projectVersions = this.versionsByProject.get(projectId);
    if (!projectVersions) {
      return [];
    }

    // Convert to array and sort by timestamp
    return Array.from(projectVersions.values()).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
  }

  /**
   * Gets the latest version for a project.
   * Returns null if no versions exist.
   */
  getLatestVersion(projectId: string): Version | null {
    const versions = this.getAllVersions(projectId);
    return versions.length > 0 ? versions[versions.length - 1] : null;
  }

  /**
   * Gets the version count for a project.
   */
  getVersionCount(projectId: string): number {
    const projectVersions = this.versionsByProject.get(projectId);
    return projectVersions?.size ?? 0;
  }

  /**
   * Clears all versions for a project.
   * Primarily used for testing.
   */
  clearProject(projectId: string): void {
    this.versionsByProject.delete(projectId);
  }

  /**
   * Clears all versions from all projects.
   * Primarily used for testing.
   */
  clearAll(): void {
    this.versionsByProject.clear();
  }

  /**
   * Performs an undo operation, restoring the previous version's state.
   * Creates a new version representing the undo action (not a pointer move).
   * Requirements: 6.1, 6.4
   * 
   * @param projectId - The ID of the project to undo
   * @returns Result containing the restored state and new version, or error
   */
  undo(projectId: string): UndoRevertResult {
    const versions = this.getAllVersions(projectId);

    if (versions.length < 2) {
      return {
        success: false,
        error: 'Cannot undo: no previous version exists',
      };
    }

    // Get the previous version (second to last)
    const previousVersion = versions[versions.length - 2];
    const currentVersion = versions[versions.length - 1];

    // Compute diffs from current state to previous state
    const diffs = getDiffEngine().computeDiffsFromFiles(currentVersion.files, previousVersion.files);

    // Create a new project state from the previous version's files
    const restoredProjectState: ProjectState = {
      id: projectId,
      name: '', // Will be set by caller if needed
      description: '',
      files: { ...previousVersion.files },
      createdAt: new Date(),
      updatedAt: new Date(),
      currentVersionId: '', // Will be updated after version creation
    };

    // Create a new version for the undo action
    const undoVersion = this.createVersion({
      projectState: restoredProjectState,
      prompt: `Undo: reverted to "${previousVersion.prompt}"`,
      diffs,
      parentVersionId: currentVersion.id,
    });

    // Update the project state with the new version ID
    restoredProjectState.currentVersionId = undoVersion.id;

    return {
      success: true,
      projectState: restoredProjectState,
      version: undoVersion,
    };
  }

  /**
   * Reverts to a specific version, restoring that version's state.
   * Creates a new version representing the revert action (not a pointer move).
   * Requirements: 6.2, 6.4
   * 
   * @param projectId - The ID of the project
   * @param versionId - The ID of the version to revert to
   * @returns Result containing the restored state and new version, or error
   */
  revertToVersion(projectId: string, versionId: string): UndoRevertResult {
    const targetVersion = this.getVersion(projectId, versionId);

    if (!targetVersion) {
      return {
        success: false,
        error: `Version not found: ${versionId}`,
      };
    }

    const latestVersion = this.getLatestVersion(projectId);

    if (!latestVersion) {
      return {
        success: false,
        error: 'No versions exist for this project',
      };
    }

    // If reverting to the current version, no action needed but still create a version
    // to maintain the invariant that revert always creates a new version

    // Compute diffs from current state to target state
    const diffs = getDiffEngine().computeDiffsFromFiles(latestVersion.files, targetVersion.files);

    // Create a new project state from the target version's files
    const restoredProjectState: ProjectState = {
      id: projectId,
      name: '', // Will be set by caller if needed
      description: '',
      files: { ...targetVersion.files },
      createdAt: new Date(),
      updatedAt: new Date(),
      currentVersionId: '', // Will be updated after version creation
    };

    // Create a new version for the revert action
    const revertVersion = this.createVersion({
      projectState: restoredProjectState,
      prompt: `Revert: restored to "${targetVersion.prompt}"`,
      diffs,
      parentVersionId: latestVersion.id,
    });

    // Update the project state with the new version ID
    restoredProjectState.currentVersionId = revertVersion.id;

    return {
      success: true,
      projectState: restoredProjectState,
      version: revertVersion,
    };
  }
}

// Singleton instance for the application
let versionManagerInstance: VersionManager | null = null;

/**
 * Gets the singleton VersionManager instance.
 */
export function getVersionManager(): VersionManager {
  if (!versionManagerInstance) {
    versionManagerInstance = new VersionManager();
  }
  return versionManagerInstance;
}

/**
 * Creates a new VersionManager instance.
 * Use this for testing to get isolated instances.
 */
export function createVersionManager(): VersionManager {
  return new VersionManager();
}
