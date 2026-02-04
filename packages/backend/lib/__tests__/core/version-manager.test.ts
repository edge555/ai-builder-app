/**
 * Unit tests for Version Manager Service
 * Tests Requirements 1.6, 2.2, 2.3, 6.1, 6.2, 6.4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VersionManager, createVersionManager } from '../../core';
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
});
