/**
 * Version Manager Service
 * Manages immutable version snapshots for project state history.
 * Implements Requirements 1.6, 2.2, 2.3, 6.1, 6.2, 6.4
 *
 * Memory Management (Phase 1, Task 1.3):
 * - Limits versions per project to prevent unbounded growth
 * - Implements LRU eviction for projects
 * - Provides bounded memory usage guarantees
 */

import { v4 as uuidv4 } from 'uuid';
import type { Version, ProjectState, FileDiff } from '@ai-app-builder/shared';
import { getDiffEngine } from '../diff/diff-engine';
import { createLogger } from '../logger';

const logger = createLogger('version-manager');

/**
 * Maximum number of versions to keep per project.
 * When exceeded, oldest versions are evicted (FIFO).
 */
const MAX_VERSIONS_PER_PROJECT = 50;

/**
 * Maximum number of projects to keep in memory.
 * When exceeded, least recently used (LRU) projects are evicted.
 */
const MAX_PROJECTS = 500;

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
 * Implements bounded memory usage via LRU eviction.
 */
export class VersionManager {
  /** In-memory storage: projectId -> versionId -> Version */
  private readonly versionsByProject: Map<string, Map<string, Version>>;

  /** LRU tracking: projectId -> last access timestamp */
  private readonly projectAccessTimes: Map<string, number>;

  constructor() {
    this.versionsByProject = new Map();
    this.projectAccessTimes = new Map();
  }

  /**
   * Updates the last access time for a project (LRU tracking).
   */
  private touchProject(projectId: string): void {
    // Move to the end of the Map to maintain LRU order via insertion order
    this.projectAccessTimes.delete(projectId);
    this.projectAccessTimes.set(projectId, Date.now());
  }

  /**
   * Evicts the oldest versions from a project to maintain MAX_VERSIONS_PER_PROJECT limit.
   * Uses FIFO (First In, First Out) eviction strategy.
   */
  private evictOldestVersions(projectId: string): void {
    const projectVersions = this.versionsByProject.get(projectId);
    if (!projectVersions) return;

    const versionCount = projectVersions.size;
    if (versionCount <= MAX_VERSIONS_PER_PROJECT) return;

    // Calculate how many to evict
    const toEvict = versionCount - MAX_VERSIONS_PER_PROJECT;

    // Map iterator returns keys in insertion order (FIFO)
    const keys = projectVersions.keys();
    for (let i = 0; i < toEvict; i++) {
      const result = keys.next();
      if (!result.done) {
        projectVersions.delete(result.value);
      }
    }

    logger.info(`Evicted ${toEvict} old version(s) from project ${projectId}`, {
      projectId,
      evictedCount: toEvict,
      before: versionCount,
      after: projectVersions.size,
    });
  }

  /**
   * Evicts least recently used projects to maintain MAX_PROJECTS limit.
   * Uses LRU (Least Recently Used) eviction strategy.
   */
  private evictLRUProjects(): void {
    const projectCount = this.versionsByProject.size;
    if (projectCount <= MAX_PROJECTS) return;

    // Calculate how many to evict
    const toEvict = projectCount - MAX_PROJECTS;

    // Map iterator returns keys in insertion order (LRU due to touchProject's delete/set)
    const keys = this.projectAccessTimes.keys();
    for (let i = 0; i < toEvict; i++) {
      const result = keys.next();
      if (!result.done) {
        const projectId = result.value;
        const versionCount = this.versionsByProject.get(projectId)?.size ?? 0;

        this.versionsByProject.delete(projectId);
        this.projectAccessTimes.delete(projectId);

        logger.info(`Evicted LRU project ${projectId}`, {
          projectId,
          versionCount,
          before: projectCount,
          after: this.versionsByProject.size,
        });
      }
    }
  }

  /**
   * Creates a new immutable version snapshot.
   * Requirements: 1.6, 2.2
   * Implements bounded memory usage (Phase 1, Task 1.3).
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

    // Update LRU tracking
    this.touchProject(projectState.id);

    // Enforce version limit per project (FIFO eviction)
    this.evictOldestVersions(projectState.id);

    // Enforce global project limit (LRU eviction)
    this.evictLRUProjects();

    return version;
  }

  /**
   * Retrieves a specific version by ID.
   * Returns null if the version doesn't exist.
   * Updates LRU tracking on access.
   */
  getVersion(projectId: string, versionId: string): Version | null {
    const projectVersions = this.versionsByProject.get(projectId);
    if (!projectVersions) {
      return null;
    }

    const version = projectVersions.get(versionId) ?? null;
    if (version) {
      // Update LRU tracking on successful access
      this.touchProject(projectId);
    }

    return version;
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
   * Updates LRU tracking on access.
   */
  getAllVersions(projectId: string): Version[] {
    const projectVersions = this.versionsByProject.get(projectId);
    if (!projectVersions) {
      return [];
    }

    // Update LRU tracking
    this.touchProject(projectId);

    // Convert to array and sort by timestamp
    return Array.from(projectVersions.values()).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
  }

  /**
   * Gets the latest version for a project.
   * Returns null if no versions exist.
   * Uses O(n) linear scan instead of O(n log n) sort.
   */
  getLatestVersion(projectId: string): Version | null {
    const projectVersions = this.versionsByProject.get(projectId);
    if (!projectVersions || projectVersions.size === 0) {
      return null;
    }

    // Update LRU tracking
    this.touchProject(projectId);

    // Find the version with max timestamp in O(n) time
    let latestVersion: Version | null = null;
    let maxTimestamp = -Infinity;

    for (const version of projectVersions.values()) {
      const timestamp = version.timestamp.getTime();
      if (timestamp > maxTimestamp) {
        maxTimestamp = timestamp;
        latestVersion = version;
      }
    }

    return latestVersion;
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
    this.projectAccessTimes.clear();
  }

  /**
   * Performs periodic cleanup of memory.
   * Enforces version and project limits.
   * Should be called periodically from API routes or scheduled tasks.
   *
   * @returns Statistics about the cleanup operation
   */
  cleanup(): { projectsEvicted: number; versionsEvicted: number } {
    let totalVersionsEvicted = 0;
    const projectCountBefore = this.versionsByProject.size;

    // First, evict old versions from each project
    for (const projectId of this.versionsByProject.keys()) {
      const versionCountBefore = this.versionsByProject.get(projectId)?.size ?? 0;
      this.evictOldestVersions(projectId);
      const versionCountAfter = this.versionsByProject.get(projectId)?.size ?? 0;
      totalVersionsEvicted += versionCountBefore - versionCountAfter;
    }

    // Then, evict LRU projects
    this.evictLRUProjects();
    const projectCountAfter = this.versionsByProject.size;
    const projectsEvicted = projectCountBefore - projectCountAfter;

    if (projectsEvicted > 0 || totalVersionsEvicted > 0) {
      logger.info('Cleanup complete', {
        projectsEvicted,
        versionsEvicted: totalVersionsEvicted
      });
    }

    return {
      projectsEvicted,
      versionsEvicted: totalVersionsEvicted,
    };
  }

  /**
   * Gets memory usage statistics.
   * Useful for monitoring and debugging.
   *
   * @returns Statistics about current memory usage
   */
  getStats(): {
    projectCount: number;
    totalVersions: number;
    avgVersionsPerProject: number;
    maxVersionsPerProject: number;
    minVersionsPerProject: number;
  } {
    const projectCount = this.versionsByProject.size;
    let totalVersions = 0;
    let maxVersions = 0;
    let minVersions = Infinity;

    for (const projectVersions of this.versionsByProject.values()) {
      const count = projectVersions.size;
      totalVersions += count;
      maxVersions = Math.max(maxVersions, count);
      minVersions = Math.min(minVersions, count);
    }

    // Handle edge case when no projects exist
    if (projectCount === 0) {
      minVersions = 0;
    }

    return {
      projectCount,
      totalVersions,
      avgVersionsPerProject: projectCount > 0 ? totalVersions / projectCount : 0,
      maxVersionsPerProject: maxVersions,
      minVersionsPerProject: minVersions === Infinity ? 0 : minVersions,
    };
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
