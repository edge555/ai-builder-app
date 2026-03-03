/**
 * Unit tests for Version Manager Service
 * Tests Requirements 1.6, 2.2, 2.3, 6.1, 6.2, 6.4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VersionManager, createVersionManager } from '../../core/version-manager';
import type { ProjectState, FileDiff } from '@ai-app-builder/shared';

describe('VersionManager', () => {
  let versionManager: VersionManager;
  let testProjectState: ProjectState;

  beforeEach(() => {
    versionManager = createVersionManager();
    testProjectState = {
      id: 'test-project-id',
      name: 'Test Project',
      description: 'A test project',
      files: {
        'src/index.ts': 'console.log("hello");',
        'package.json': '{"name": "test"}',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      currentVersionId: '',
    };
  });

  describe('createVersion', () => {
    it('should create a version with all required fields', () => {
      const diffs: FileDiff[] = [
        {
          filePath: 'src/index.ts',
          status: 'added',
          hunks: [],
        },
      ];

      const version = versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'Create a hello world app',
        diffs,
        parentVersionId: null,
      });

      expect(version.id).toBeDefined();
      expect(version.projectId).toBe(testProjectState.id);
      expect(version.prompt).toBe('Create a hello world app');
      expect(version.timestamp).toBeInstanceOf(Date);
      expect(version.files).toEqual(testProjectState.files);
      expect(version.diffs).toEqual(diffs);
      expect(version.parentVersionId).toBeNull();
    });

    it('should create a snapshot copy of files', () => {
      const version = versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'Initial',
        diffs: [],
        parentVersionId: null,
      });

      // Modify original files
      testProjectState.files['new-file.ts'] = 'new content';

      // Version files should not be affected
      expect(version.files['new-file.ts']).toBeUndefined();
    });

    it('should link versions via parentVersionId', () => {
      const v1 = versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'First version',
        diffs: [],
        parentVersionId: null,
      });

      const v2 = versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'Second version',
        diffs: [],
        parentVersionId: v1.id,
      });

      expect(v2.parentVersionId).toBe(v1.id);
    });
  });

  describe('getVersion', () => {
    it('should retrieve a stored version', () => {
      const created = versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'Test',
        diffs: [],
        parentVersionId: null,
      });

      const retrieved = versionManager.getVersion(testProjectState.id, created.id);

      expect(retrieved).toEqual(created);
    });

    it('should return null for non-existent version', () => {
      const result = versionManager.getVersion('unknown-project', 'unknown-version');
      expect(result).toBeNull();
    });

    it('should return null for non-existent project', () => {
      versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'Test',
        diffs: [],
        parentVersionId: null,
      });

      const result = versionManager.getVersion('other-project', 'some-id');
      expect(result).toBeNull();
    });
  });

  describe('getAllVersions', () => {
    it('should return empty array for unknown project', () => {
      const versions = versionManager.getAllVersions('unknown-project');
      expect(versions).toEqual([]);
    });

    it('should return all versions sorted by timestamp', async () => {
      const v1 = versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'First',
        diffs: [],
        parentVersionId: null,
      });

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const v2 = versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'Second',
        diffs: [],
        parentVersionId: v1.id,
      });

      const versions = versionManager.getAllVersions(testProjectState.id);

      expect(versions).toHaveLength(2);
      expect(versions[0].id).toBe(v1.id);
      expect(versions[1].id).toBe(v2.id);
    });

    it('should maintain complete history (Requirement 2.3)', async () => {
      const prompts = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
      let parentId: string | null = null;

      for (const prompt of prompts) {
        const version = versionManager.createVersion({
          projectState: testProjectState,
          prompt,
          diffs: [],
          parentVersionId: parentId,
        });
        parentId = version.id;
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      const versions = versionManager.getAllVersions(testProjectState.id);

      expect(versions).toHaveLength(5);
      expect(versions.map(v => v.prompt)).toEqual(prompts);
    });
  });

  describe('getLatestVersion', () => {
    it('should return null for unknown project', () => {
      const latest = versionManager.getLatestVersion('unknown');
      expect(latest).toBeNull();
    });

    it('should return the most recent version', async () => {
      versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'First',
        diffs: [],
        parentVersionId: null,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const v2 = versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'Second',
        diffs: [],
        parentVersionId: null,
      });

      const latest = versionManager.getLatestVersion(testProjectState.id);
      expect(latest?.id).toBe(v2.id);
    });
  });

  describe('getVersionCount', () => {
    it('should return 0 for unknown project', () => {
      expect(versionManager.getVersionCount('unknown')).toBe(0);
    });

    it('should return correct count', () => {
      versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'First',
        diffs: [],
        parentVersionId: null,
      });

      versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'Second',
        diffs: [],
        parentVersionId: null,
      });

      expect(versionManager.getVersionCount(testProjectState.id)).toBe(2);
    });
  });

  describe('clearProject', () => {
    it('should remove all versions for a project', () => {
      versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'Test',
        diffs: [],
        parentVersionId: null,
      });

      versionManager.clearProject(testProjectState.id);

      expect(versionManager.getAllVersions(testProjectState.id)).toEqual([]);
    });
  });

  describe('clearAll', () => {
    it('should remove all versions from all projects', () => {
      const project2: ProjectState = { ...testProjectState, id: 'project-2' };

      versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'Test 1',
        diffs: [],
        parentVersionId: null,
      });

      versionManager.createVersion({
        projectState: project2,
        prompt: 'Test 2',
        diffs: [],
        parentVersionId: null,
      });

      versionManager.clearAll();

      expect(versionManager.getAllVersions(testProjectState.id)).toEqual([]);
      expect(versionManager.getAllVersions(project2.id)).toEqual([]);
    });
  });

  describe('undo', () => {
    it('should return error when no previous version exists', () => {
      const result = versionManager.undo('unknown-project');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot undo: no previous version exists');
    });

    it('should return error when only one version exists', () => {
      versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'Initial',
        diffs: [],
        parentVersionId: null,
      });

      const result = versionManager.undo(testProjectState.id);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot undo: no previous version exists');
    });

    it('should restore previous version state (Requirement 6.1)', async () => {
      // Create first version
      const v1 = versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'Initial version',
        diffs: [],
        parentVersionId: null,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      // Create second version with modified files
      const modifiedState: ProjectState = {
        ...testProjectState,
        files: {
          'src/index.ts': 'console.log("modified");',
          'package.json': '{"name": "test"}',
          'src/new-file.ts': 'export const x = 1;',
        },
      };

      versionManager.createVersion({
        projectState: modifiedState,
        prompt: 'Modified version',
        diffs: [],
        parentVersionId: v1.id,
      });

      // Perform undo
      const result = versionManager.undo(testProjectState.id);

      expect(result.success).toBe(true);
      expect(result.projectState).toBeDefined();
      expect(result.projectState!.files).toEqual(testProjectState.files);
    });

    it('should create a new version for undo (Requirement 6.4)', async () => {
      const v1 = versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'First',
        diffs: [],
        parentVersionId: null,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const v2 = versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'Second',
        diffs: [],
        parentVersionId: v1.id,
      });

      const countBefore = versionManager.getVersionCount(testProjectState.id);
      
      const result = versionManager.undo(testProjectState.id);

      expect(result.success).toBe(true);
      expect(result.version).toBeDefined();
      expect(result.version!.parentVersionId).toBe(v2.id);
      expect(versionManager.getVersionCount(testProjectState.id)).toBe(countBefore + 1);
    });

    it('should include undo prompt in new version', async () => {
      const v1 = versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'Create hello world',
        diffs: [],
        parentVersionId: null,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'Add feature',
        diffs: [],
        parentVersionId: v1.id,
      });

      const result = versionManager.undo(testProjectState.id);

      expect(result.success).toBe(true);
      expect(result.version!.prompt).toContain('Undo');
      expect(result.version!.prompt).toContain('Create hello world');
    });
  });

  describe('revertToVersion', () => {
    it('should return error for non-existent version', () => {
      versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'Initial',
        diffs: [],
        parentVersionId: null,
      });

      const result = versionManager.revertToVersion(testProjectState.id, 'non-existent-id');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Version not found');
    });

    it('should return error for non-existent project', () => {
      const result = versionManager.revertToVersion('unknown-project', 'some-version');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Version not found');
    });

    it('should restore specified version state (Requirement 6.2)', async () => {
      // Create three versions with different files
      const v1 = versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'Version 1',
        diffs: [],
        parentVersionId: null,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const state2: ProjectState = {
        ...testProjectState,
        files: {
          'src/index.ts': 'console.log("v2");',
          'package.json': '{"name": "test-v2"}',
        },
      };
      const v2 = versionManager.createVersion({
        projectState: state2,
        prompt: 'Version 2',
        diffs: [],
        parentVersionId: v1.id,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const state3: ProjectState = {
        ...testProjectState,
        files: {
          'src/index.ts': 'console.log("v3");',
          'package.json': '{"name": "test-v3"}',
        },
      };
      versionManager.createVersion({
        projectState: state3,
        prompt: 'Version 3',
        diffs: [],
        parentVersionId: v2.id,
      });

      // Revert to version 1
      const result = versionManager.revertToVersion(testProjectState.id, v1.id);

      expect(result.success).toBe(true);
      expect(result.projectState).toBeDefined();
      expect(result.projectState!.files).toEqual(testProjectState.files);
    });

    it('should create a new version for revert (Requirement 6.4)', async () => {
      const v1 = versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'First',
        diffs: [],
        parentVersionId: null,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const v2 = versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'Second',
        diffs: [],
        parentVersionId: v1.id,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const v3 = versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'Third',
        diffs: [],
        parentVersionId: v2.id,
      });

      const countBefore = versionManager.getVersionCount(testProjectState.id);
      
      const result = versionManager.revertToVersion(testProjectState.id, v1.id);

      expect(result.success).toBe(true);
      expect(result.version).toBeDefined();
      expect(result.version!.parentVersionId).toBe(v3.id);
      expect(versionManager.getVersionCount(testProjectState.id)).toBe(countBefore + 1);
    });

    it('should include revert prompt in new version', async () => {
      const v1 = versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'Create hello world',
        diffs: [],
        parentVersionId: null,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'Add feature',
        diffs: [],
        parentVersionId: v1.id,
      });

      const result = versionManager.revertToVersion(testProjectState.id, v1.id);

      expect(result.success).toBe(true);
      expect(result.version!.prompt).toContain('Revert');
      expect(result.version!.prompt).toContain('Create hello world');
    });

    it('should compute correct diffs when reverting', async () => {
      const v1 = versionManager.createVersion({
        projectState: testProjectState,
        prompt: 'Initial',
        diffs: [],
        parentVersionId: null,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const modifiedState: ProjectState = {
        ...testProjectState,
        files: {
          'src/index.ts': 'console.log("modified");',
          'package.json': '{"name": "test"}',
          'src/new-file.ts': 'export const x = 1;',
        },
      };

      versionManager.createVersion({
        projectState: modifiedState,
        prompt: 'Modified',
        diffs: [],
        parentVersionId: v1.id,
      });

      const result = versionManager.revertToVersion(testProjectState.id, v1.id);

      expect(result.success).toBe(true);
      expect(result.version!.diffs).toBeDefined();
      expect(result.version!.diffs.length).toBeGreaterThan(0);
      
      // Should have a deleted file (new-file.ts was added in v2, removed in revert)
      const deletedFile = result.version!.diffs.find(d => d.filePath === 'src/new-file.ts');
      expect(deletedFile).toBeDefined();
      expect(deletedFile!.status).toBe('deleted');
    });
  });

  describe('Memory Management (Phase 1, Task 1.3)', () => {
    describe('Version Eviction (FIFO)', () => {
      it('should evict oldest versions when MAX_VERSIONS_PER_PROJECT is exceeded', async () => {
        // Create more than MAX_VERSIONS_PER_PROJECT versions (50)
        const versionIds: string[] = [];
        let parentId: string | null = null;

        for (let i = 0; i < 55; i++) {
          const version = versionManager.createVersion({
            projectState: { ...testProjectState, files: { 'file.ts': `version ${i}` } },
            prompt: `Version ${i}`,
            diffs: [],
            parentVersionId: parentId,
          });
          versionIds.push(version.id);
          parentId = version.id;
          await new Promise(resolve => setTimeout(resolve, 2)); // Ensure different timestamps
        }

        // Should only keep the latest 50 versions
        const remainingVersions = versionManager.getAllVersions(testProjectState.id);
        expect(remainingVersions).toHaveLength(50);

        // First 5 versions should be evicted
        for (let i = 0; i < 5; i++) {
          const evictedVersion = versionManager.getVersion(testProjectState.id, versionIds[i]);
          expect(evictedVersion).toBeNull();
        }

        // Last 50 versions should still exist
        for (let i = 5; i < 55; i++) {
          const remainingVersion = versionManager.getVersion(testProjectState.id, versionIds[i]);
          expect(remainingVersion).not.toBeNull();
        }
      });

      it('should preserve most recent versions during eviction', async () => {
        // Create 52 versions
        for (let i = 0; i < 52; i++) {
          versionManager.createVersion({
            projectState: { ...testProjectState, files: { 'file.ts': `v${i}` } },
            prompt: `Version ${i}`,
            diffs: [],
            parentVersionId: null,
          });
          await new Promise(resolve => setTimeout(resolve, 2));
        }

        const versions = versionManager.getAllVersions(testProjectState.id);
        expect(versions).toHaveLength(50);

        // Latest version should be version 51 (0-indexed)
        const latestVersion = versionManager.getLatestVersion(testProjectState.id);
        expect(latestVersion?.prompt).toBe('Version 51');

        // First version should be version 2 (versions 0 and 1 were evicted)
        expect(versions[0].prompt).toBe('Version 2');
      });
    });

    describe('Project Eviction (LRU)', () => {
      it('should evict least recently used projects when MAX_PROJECTS is exceeded', async () => {
        // Create more than MAX_PROJECTS (500) projects
        // Use smaller number for test performance, but enough to test eviction logic
        const projectIds: string[] = [];
        const testProjectLimit = 505;

        for (let i = 0; i < testProjectLimit; i++) {
          const projectId = `lru-test-project-${i}`;
          projectIds.push(projectId);

          versionManager.createVersion({
            projectState: { ...testProjectState, id: projectId },
            prompt: `Project ${i} initial version`,
            diffs: [],
            parentVersionId: null,
          });
          // No delay needed - createVersion handles LRU timing
        }

        // Should only keep 500 projects
        const stats = versionManager.getStats();
        expect(stats.projectCount).toBe(500);

        // First 5 projects should be evicted (LRU)
        for (let i = 0; i < 5; i++) {
          const evictedVersions = versionManager.getAllVersions(projectIds[i]);
          expect(evictedVersions).toHaveLength(0);
        }

        // Last 500 projects should still exist
        for (let i = 5; i < testProjectLimit; i++) {
          const remainingVersions = versionManager.getAllVersions(projectIds[i]);
          expect(remainingVersions.length).toBeGreaterThan(0);
        }
      }, 10000); // 10s timeout for this test

      it('should preserve recently accessed projects during LRU eviction', async () => {
        // Create exactly 500 projects (at the limit)
        const projectIds: string[] = [];

        for (let i = 0; i < 500; i++) {
          const projectId = `lru-access-test-${i}`;
          projectIds.push(projectId);

          versionManager.createVersion({
            projectState: { ...testProjectState, id: projectId },
            prompt: 'Initial',
            diffs: [],
            parentVersionId: null,
          });
        }

        // Small delay to ensure time differences
        await new Promise(resolve => setTimeout(resolve, 10));

        // Access project 0 and 1 (should make them "recently used" and move them to the end of LRU)
        versionManager.getAllVersions(projectIds[0]);
        await new Promise(resolve => setTimeout(resolve, 5));
        versionManager.getAllVersions(projectIds[1]);
        await new Promise(resolve => setTimeout(resolve, 5));

        // Create two more projects to trigger eviction (will evict 2 LRU projects)
        for (let i = 500; i < 502; i++) {
          const projectId = `lru-access-test-${i}`;
          projectIds.push(projectId);
          versionManager.createVersion({
            projectState: { ...testProjectState, id: projectId },
            prompt: 'Initial',
            diffs: [],
            parentVersionId: null,
          });
        }

        // Projects 0 and 1 should still exist (recently accessed, so not LRU)
        expect(versionManager.getAllVersions(projectIds[0]).length).toBeGreaterThan(0);
        expect(versionManager.getAllVersions(projectIds[1]).length).toBeGreaterThan(0);

        // Projects 2 and 3 should be evicted (they are the oldest after 0 and 1 were refreshed)
        expect(versionManager.getAllVersions(projectIds[2])).toHaveLength(0);
        expect(versionManager.getAllVersions(projectIds[3])).toHaveLength(0);

        // Verify we're still at the limit
        expect(versionManager.getStats().projectCount).toBe(500);
      }, 10000); // 10s timeout for this test

      it('should update LRU on version access', async () => {
        // Create 3 projects
        const project1 = 'project-1';
        const project2 = 'project-2';
        const project3 = 'project-3';

        const v1 = versionManager.createVersion({
          projectState: { ...testProjectState, id: project1 },
          prompt: 'P1',
          diffs: [],
          parentVersionId: null,
        });

        await new Promise(resolve => setTimeout(resolve, 2));

        versionManager.createVersion({
          projectState: { ...testProjectState, id: project2 },
          prompt: 'P2',
          diffs: [],
          parentVersionId: null,
        });

        await new Promise(resolve => setTimeout(resolve, 2));

        versionManager.createVersion({
          projectState: { ...testProjectState, id: project3 },
          prompt: 'P3',
          diffs: [],
          parentVersionId: null,
        });

        // Access project1's version (should update LRU)
        await new Promise(resolve => setTimeout(resolve, 2));
        versionManager.getVersion(project1, v1.id);

        // All three should exist
        expect(versionManager.getAllVersions(project1).length).toBeGreaterThan(0);
        expect(versionManager.getAllVersions(project2).length).toBeGreaterThan(0);
        expect(versionManager.getAllVersions(project3).length).toBeGreaterThan(0);
      });
    });

    describe('cleanup method', () => {
      it('should return zero evictions when within limits', () => {
        versionManager.createVersion({
          projectState: testProjectState,
          prompt: 'Test',
          diffs: [],
          parentVersionId: null,
        });

        const result = versionManager.cleanup();

        expect(result.projectsEvicted).toBe(0);
        expect(result.versionsEvicted).toBe(0);
      });

      it('should evict excess versions during creation', async () => {
        // Create a project with excess versions
        const uniqueProjectId = 'cleanup-test-project';
        for (let i = 0; i < 55; i++) {
          versionManager.createVersion({
            projectState: { ...testProjectState, id: uniqueProjectId },
            prompt: `V${i}`,
            diffs: [],
            parentVersionId: null,
          });
          await new Promise(resolve => setTimeout(resolve, 1));
        }

        // Versions should be automatically evicted during creation
        const stats = versionManager.getStats();
        expect(stats.totalVersions).toBe(50); // Only 50 versions kept

        // Cleanup should not evict more (already within limits)
        const result = versionManager.cleanup();
        expect(result.versionsEvicted).toBe(0);
        expect(result.projectsEvicted).toBe(0);
      });
    });

    describe('getStats method', () => {
      it('should return zero stats for empty version manager', () => {
        const stats = versionManager.getStats();

        expect(stats.projectCount).toBe(0);
        expect(stats.totalVersions).toBe(0);
        expect(stats.avgVersionsPerProject).toBe(0);
        expect(stats.maxVersionsPerProject).toBe(0);
        expect(stats.minVersionsPerProject).toBe(0);
      });

      it('should calculate correct statistics', async () => {
        // Use unique project IDs to avoid conflicts with other tests
        const statsProject1 = 'stats-test-project-1';
        const statsProject2 = 'stats-test-project-2';

        // Project 1: 3 versions
        for (let i = 0; i < 3; i++) {
          versionManager.createVersion({
            projectState: { ...testProjectState, id: statsProject1 },
            prompt: `V${i}`,
            diffs: [],
            parentVersionId: null,
          });
          await new Promise(resolve => setTimeout(resolve, 1));
        }

        // Project 2: 5 versions
        for (let i = 0; i < 5; i++) {
          versionManager.createVersion({
            projectState: { ...testProjectState, id: statsProject2 },
            prompt: `V${i}`,
            diffs: [],
            parentVersionId: null,
          });
          await new Promise(resolve => setTimeout(resolve, 1));
        }

        const stats = versionManager.getStats();

        expect(stats.projectCount).toBeGreaterThanOrEqual(2);
        expect(stats.totalVersions).toBeGreaterThanOrEqual(8);

        // Check that our specific projects have the right number of versions
        expect(versionManager.getVersionCount(statsProject1)).toBe(3);
        expect(versionManager.getVersionCount(statsProject2)).toBe(5);
      });
    });

    describe('clearAll with LRU tracking', () => {
      it('should clear both versions and LRU tracking', () => {
        versionManager.createVersion({
          projectState: testProjectState,
          prompt: 'Test',
          diffs: [],
          parentVersionId: null,
        });

        versionManager.clearAll();

        const stats = versionManager.getStats();
        expect(stats.projectCount).toBe(0);
        expect(stats.totalVersions).toBe(0);
      });
    });
  });
});
