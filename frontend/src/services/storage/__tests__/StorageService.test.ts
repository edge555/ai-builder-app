import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storageService } from '../StorageService';
import type { StoredProject } from '../types';

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
    const mockProject: StoredProject = {
        id: 'test-project-1',
        name: 'Test Project',
        projectState: {
            id: 'test-project-1',
            name: 'Test Project',
            files: {
                'index.html': '<html></html>',
            },
        },
        messages: [],
        createdAt: '2024-01-01T10:00:00Z',
        updatedAt: '2024-01-01T10:00:00Z',
    };

    beforeEach(async () => {
        // Initialize the database before each test
        await storageService.initialize();
    });

    it('should initialize database successfully', async () => {
        await expect(storageService.initialize()).resolves.not.toThrow();
    });

    it('should save a project to IndexedDB', async () => {
        await expect(storageService.saveProject(mockProject)).resolves.not.toThrow();
    });

    it('should retrieve a saved project by ID', async () => {
        await storageService.saveProject(mockProject);
        const retrieved = await storageService.getProject('test-project-1');

        expect(retrieved).toBeDefined();
        expect(retrieved?.id).toBe('test-project-1');
        expect(retrieved?.name).toBe('Test Project');
    });

    it('should return undefined for non-existent project', async () => {
        const retrieved = await storageService.getProject('non-existent-id');
        expect(retrieved).toBeUndefined();
    });

    it('should get all projects', async () => {
        await storageService.saveProject(mockProject);
        await storageService.saveProject({
            ...mockProject,
            id: 'test-project-2',
            name: 'Test Project 2',
        });

        const projects = await storageService.getAllProjects();
        expect(projects.length).toBeGreaterThanOrEqual(2);
    });

    it('should delete a project', async () => {
        await storageService.saveProject(mockProject);
        await storageService.deleteProject('test-project-1');

        const retrieved = await storageService.getProject('test-project-1');
        expect(retrieved).toBeUndefined();
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

    it('should duplicate a project', async () => {
        await storageService.saveProject(mockProject);
        const duplicated = await storageService.duplicateProject('test-project-1');

        expect(duplicated.id).not.toBe('test-project-1');
        expect(duplicated.name).toBe('Test Project (Copy)');

        const retrieved = await storageService.getProject(duplicated.id);
        expect(retrieved).toBeDefined();
    });

    it('should throw error when duplicating non-existent project', async () => {
        await expect(
            storageService.duplicateProject('non-existent')
        ).rejects.toThrow();
    });

    it('should set and get metadata', async () => {
        await storageService.setMetadata('testKey', 'testValue');
        const value = await storageService.getMetadata('testKey');

        expect(value).toBe('testValue');
    });

    it('should return undefined for non-existent metadata', async () => {
        const value = await storageService.getMetadata('non-existent-key');
        expect(value).toBeUndefined();
    });

    it('should update updatedAt timestamp when saving', async () => {
        const oldTimestamp = mockProject.updatedAt;

        // Wait a bit to ensure timestamp difference
        await new Promise(resolve => setTimeout(resolve, 10));

        await storageService.saveProject(mockProject);
        const retrieved = await storageService.getProject('test-project-1');

        expect(retrieved?.updatedAt).not.toBe(oldTimestamp);
    });

    it('should handle concurrent saves gracefully', async () => {
        const promises = Array.from({ length: 5 }, (_, i) =>
            storageService.saveProject({
                ...mockProject,
                id: `concurrent-${i}`,
            })
        );

        await expect(Promise.all(promises)).resolves.not.toThrow();
    });
});
