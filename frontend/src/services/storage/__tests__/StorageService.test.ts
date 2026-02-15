import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storageService } from '../StorageService';
import type { StoredProject, SerializedChatMessage } from '../types';

// Mock logger
vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('StorageService', () => {
  const mockChatMessages: SerializedChatMessage[] = [
    {
      id: 'msg-1',
      role: 'user',
      content: 'Create a button',
      timestamp: '2024-01-01T10:00:00Z',
    },
    {
      id: 'msg-2',
      role: 'assistant',
      content: 'I created a button component',
      timestamp: '2024-01-01T10:01:00Z',
    },
  ];

  const mockProject: StoredProject = {
    id: 'test-project-1',
    name: 'Test Project',
    description: 'A test project',
    files: {
      'index.html': '<html><body>Hello</body></html>',
      'styles.css': 'body { margin: 0; }',
    },
    currentVersionId: 'v1',
    createdAt: '2024-01-01T10:00:00Z',
    updatedAt: '2024-01-01T10:00:00Z',
    chatMessages: mockChatMessages,
    fileCount: 2,
    thumbnailFiles: ['index.html', 'styles.css'],
  };

  beforeEach(async () => {
    // Initialize the database before each test
    await storageService.initialize();
  });

  it('should initialize database successfully', async () => {
    await expect(storageService.initialize()).resolves.not.toThrow();
  });

  describe('Project CRUD operations', () => {
    it('should save a project to IndexedDB', async () => {
      await expect(storageService.saveProject(mockProject)).resolves.not.toThrow();
    });

    it('should retrieve a saved project by ID with chat messages', async () => {
      await storageService.saveProject(mockProject);
      const retrieved = await storageService.getProject('test-project-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test-project-1');
      expect(retrieved?.name).toBe('Test Project');
      expect(retrieved?.chatMessages).toHaveLength(2);
      expect(retrieved?.chatMessages[0].id).toBe('msg-1');
    });

    it('should return undefined for non-existent project', async () => {
      const retrieved = await storageService.getProject('non-existent-id');
      expect(retrieved).toBeUndefined();
    });

    it('should delete a project and its chat messages', async () => {
      await storageService.saveProject(mockProject);
      await storageService.deleteProject('test-project-1');

      const retrieved = await storageService.getProject('test-project-1');
      expect(retrieved).toBeUndefined();

      // Verify chat messages are also deleted
      const messages = await storageService.getChatMessages('test-project-1');
      expect(messages).toHaveLength(0);
    });

    it('should rename a project', async () => {
      await storageService.saveProject(mockProject);
      await storageService.renameProject('test-project-1', 'Renamed Project');

      const retrieved = await storageService.getProject('test-project-1');
      expect(retrieved?.name).toBe('Renamed Project');
    });

    it('should throw error when renaming non-existent project', async () => {
      await expect(
        storageService.renameProject('non-existent', 'New Name')
      ).rejects.toThrow();
    });

    it('should duplicate a project with chat messages', async () => {
      await storageService.saveProject(mockProject);
      const duplicated = await storageService.duplicateProject('test-project-1');

      expect(duplicated.id).not.toBe('test-project-1');
      expect(duplicated.name).toBe('Test Project (Copy)');

      const retrieved = await storageService.getProject(duplicated.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.chatMessages).toHaveLength(2);
    });

    it('should throw error when duplicating non-existent project', async () => {
      await expect(
        storageService.duplicateProject('non-existent')
      ).rejects.toThrow();
    });

    it('should update updatedAt timestamp when saving', async () => {
      const oldTimestamp = mockProject.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await storageService.saveProject(mockProject);
      const retrieved = await storageService.getProject('test-project-1');

      expect(retrieved?.updatedAt).not.toBe(oldTimestamp);
    });
  });

  describe('Chat messages storage', () => {
    it('should store chat messages separately from project', async () => {
      await storageService.saveProject(mockProject);
      const messages = await storageService.getChatMessages('test-project-1');

      expect(messages).toHaveLength(2);
      expect(messages[0].id).toBe('msg-1');
      expect(messages[1].id).toBe('msg-2');
    });

    it('should return empty array for project with no messages', async () => {
      const projectWithoutMessages: StoredProject = {
        ...mockProject,
        id: 'no-messages-project',
        chatMessages: [],
      };

      await storageService.saveProject(projectWithoutMessages);
      const messages = await storageService.getChatMessages('no-messages-project');

      expect(messages).toHaveLength(0);
    });

    it('should update chat messages when saving project again', async () => {
      await storageService.saveProject(mockProject);

      const updatedProject: StoredProject = {
        ...mockProject,
        chatMessages: [
          ...mockChatMessages,
          {
            id: 'msg-3',
            role: 'user',
            content: 'Add more features',
            timestamp: '2024-01-01T10:02:00Z',
          },
        ],
      };

      await storageService.saveProject(updatedProject);
      const messages = await storageService.getChatMessages('test-project-1');

      expect(messages).toHaveLength(3);
      expect(messages[2].id).toBe('msg-3');
    });
  });

  describe('Project metadata', () => {
    it('should get lightweight project metadata without files', async () => {
      await storageService.saveProject(mockProject);
      await storageService.saveProject({
        ...mockProject,
        id: 'test-project-2',
        name: 'Test Project 2',
      });

      const metadata = await storageService.getAllProjectMetadata();

      expect(metadata.length).toBeGreaterThanOrEqual(2);
      expect(metadata[0]).toHaveProperty('id');
      expect(metadata[0]).toHaveProperty('name');
      expect(metadata[0]).toHaveProperty('fileCount');
      expect(metadata[0]).toHaveProperty('thumbnailFiles');
      expect(metadata[0]).not.toHaveProperty('files');
      expect(metadata[0]).not.toHaveProperty('chatMessages');
    });

    it('should support pagination in getAllProjectMetadata', async () => {
      // Save multiple projects
      for (let i = 1; i <= 10; i++) {
        await storageService.saveProject({
          ...mockProject,
          id: `project-${i}`,
          name: `Project ${i}`,
        });
      }

      // Get first page (5 items)
      const page1 = await storageService.getAllProjectMetadata({
        offset: 0,
        limit: 5,
      });

      expect(page1).toHaveLength(5);

      // Get second page (5 items)
      const page2 = await storageService.getAllProjectMetadata({
        offset: 5,
        limit: 5,
      });

      expect(page2).toHaveLength(5);

      // Verify no overlap
      const page1Ids = page1.map((p) => p.id);
      const page2Ids = page2.map((p) => p.id);
      const overlap = page1Ids.filter((id) => page2Ids.includes(id));
      expect(overlap).toHaveLength(0);
    });

    it('should respect default limit in getAllProjectMetadata', async () => {
      // Save many projects
      for (let i = 1; i <= 60; i++) {
        await storageService.saveProject({
          ...mockProject,
          id: `project-${i}`,
          name: `Project ${i}`,
        });
      }

      const metadata = await storageService.getAllProjectMetadata();

      // Default limit is 50
      expect(metadata.length).toBeLessThanOrEqual(50);
    });
  });

  describe('getAllProjects with pagination', () => {
    it('should support pagination in getAllProjects', async () => {
      // Save multiple projects
      for (let i = 1; i <= 10; i++) {
        await storageService.saveProject({
          ...mockProject,
          id: `project-${i}`,
          name: `Project ${i}`,
        });
      }

      // Get first page
      const page1 = await storageService.getAllProjects({
        offset: 0,
        limit: 5,
      });

      expect(page1).toHaveLength(5);
      expect(page1[0]).toHaveProperty('files');
      expect(page1[0]).toHaveProperty('chatMessages');
    });

    it('should load all projects without limit', async () => {
      // Save multiple projects
      for (let i = 1; i <= 5; i++) {
        await storageService.saveProject({
          ...mockProject,
          id: `project-${i}`,
          name: `Project ${i}`,
        });
      }

      const allProjects = await storageService.getAllProjects();

      expect(allProjects.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Large project handling', () => {
    it('should handle large projects with chunked writes', async () => {
      // Create a large project with many files
      const largeFiles: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        largeFiles[`file-${i}.js`] = `// File ${i}\n${'x'.repeat(1000)}`;
      }

      const largeProject: StoredProject = {
        ...mockProject,
        id: 'large-project',
        files: largeFiles,
        fileCount: 100,
        thumbnailFiles: Object.keys(largeFiles).slice(0, 5),
      };

      await expect(storageService.saveProject(largeProject)).resolves.not.toThrow();

      const retrieved = await storageService.getProject('large-project');
      expect(retrieved).toBeDefined();
      expect(Object.keys(retrieved?.files || {})).toHaveLength(100);
    });
  });

  describe('Metadata operations', () => {
    it('should set and get metadata', async () => {
      await storageService.setMetadata('testKey', 'testValue');
      const value = await storageService.getMetadata('testKey');

      expect(value).toBe('testValue');
    });

    it('should return undefined for non-existent metadata', async () => {
      const value = await storageService.getMetadata('non-existent-key');
      expect(value).toBeUndefined();
    });

    it('should store complex metadata objects', async () => {
      const complexData = {
        settings: { theme: 'dark', fontSize: 14 },
        lastOpened: '2024-01-01T10:00:00Z',
      };

      await storageService.setMetadata('appSettings', complexData);
      const retrieved = await storageService.getMetadata('appSettings');

      expect(retrieved).toEqual(complexData);
    });
  });

  describe('Storage estimate', () => {
    it('should return storage estimate if available', async () => {
      const estimate = await storageService.getStorageEstimate();

      // May be null in test environment
      if (estimate) {
        expect(estimate).toHaveProperty('usage');
        expect(estimate).toHaveProperty('quota');
      }
    });
  });

  describe('Concurrent operations', () => {
    it('should handle concurrent saves gracefully', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        storageService.saveProject({
          ...mockProject,
          id: `concurrent-${i}`,
        })
      );

      await expect(Promise.all(promises)).resolves.not.toThrow();
    });

    it('should handle concurrent reads gracefully', async () => {
      await storageService.saveProject(mockProject);

      const promises = Array.from({ length: 10 }, () =>
        storageService.getProject('test-project-1')
      );

      const results = await Promise.all(promises);
      results.forEach((result) => {
        expect(result?.id).toBe('test-project-1');
      });
    });
  });
});
