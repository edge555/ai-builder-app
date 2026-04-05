import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hybridStorageService } from '../HybridStorageService';
import { cloudStorageService } from '@/services/cloud/CloudStorageService';
import { storageService } from '../StorageService';
import type { ProjectMetadata } from '../types';

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/services/cloud/CloudStorageService', () => ({
  cloudStorageService: {
    saveProject: vi.fn(),
    getProject: vi.fn(),
    getAllProjectMetadata: vi.fn(),
    deleteProject: vi.fn(),
    renameProject: vi.fn(),
    duplicateProject: vi.fn(),
    saveChatMessages: vi.fn(),
    getChatMessages: vi.fn(),
  },
}));

vi.mock('../StorageService', () => ({
  storageService: {
    initialize: vi.fn(),
    saveProject: vi.fn(),
    getProject: vi.fn(),
    getAllProjectMetadata: vi.fn(),
    deleteProject: vi.fn(),
    renameProject: vi.fn(),
    duplicateProject: vi.fn(),
    setMetadata: vi.fn(),
    getMetadata: vi.fn(),
    saveChatMessages: vi.fn(),
    getChatMessages: vi.fn(),
  },
}));

describe('HybridStorageService', () => {
  const localProjects: ProjectMetadata[] = [
    {
      id: 'local-only',
      name: 'Local Only',
      description: '',
      currentVersionId: 'v1',
      createdAt: '2026-04-05T10:00:00.000Z',
      updatedAt: '2026-04-05T10:00:00.000Z',
      fileCount: 3,
      thumbnailFiles: ['src/App.tsx'],
    },
    {
      id: 'shared',
      name: 'Older Local Copy',
      description: '',
      currentVersionId: 'v1',
      createdAt: '2026-04-05T09:00:00.000Z',
      updatedAt: '2026-04-05T09:00:00.000Z',
      fileCount: 2,
      thumbnailFiles: ['src/main.tsx'],
    },
  ];

  const cloudProjects: ProjectMetadata[] = [
    {
      id: 'shared',
      name: 'Cloud Copy',
      description: '',
      currentVersionId: 'v2',
      createdAt: '2026-04-05T11:00:00.000Z',
      updatedAt: '2026-04-05T11:00:00.000Z',
      fileCount: 4,
      thumbnailFiles: ['src/App.tsx'],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    hybridStorageService.setAuthenticated(null);
  });

  it('merges local and cloud metadata for authenticated users', async () => {
    hybridStorageService.setAuthenticated('user-1');
    vi.mocked(storageService.getAllProjectMetadata).mockResolvedValue(localProjects);
    vi.mocked(cloudStorageService.getAllProjectMetadata).mockResolvedValue(cloudProjects);

    const result = await hybridStorageService.getAllProjectMetadata();

    expect(result).toHaveLength(2);
    expect(result.map((project) => project.id)).toEqual(['shared', 'local-only']);
    expect(result.find((project) => project.id === 'shared')?.name).toBe('Cloud Copy');
    expect(storageService.getAllProjectMetadata).toHaveBeenCalledTimes(1);
    expect(cloudStorageService.getAllProjectMetadata).toHaveBeenCalledTimes(1);
  });

  it('falls back to local metadata when cloud fetch fails', async () => {
    hybridStorageService.setAuthenticated('user-1');
    vi.mocked(storageService.getAllProjectMetadata).mockResolvedValue(localProjects);
    vi.mocked(cloudStorageService.getAllProjectMetadata).mockRejectedValue(new Error('cloud down'));

    const result = await hybridStorageService.getAllProjectMetadata();

    expect(result).toEqual(localProjects);
  });

  it('returns local metadata only when unauthenticated', async () => {
    vi.mocked(storageService.getAllProjectMetadata).mockResolvedValue(localProjects);

    const result = await hybridStorageService.getAllProjectMetadata();

    expect(result).toEqual(localProjects);
    expect(storageService.getAllProjectMetadata).toHaveBeenCalledTimes(1);
    expect(cloudStorageService.getAllProjectMetadata).not.toHaveBeenCalled();
  });

  it('preserves local projects when cloud metadata is empty', async () => {
    hybridStorageService.setAuthenticated('user-1');
    vi.mocked(storageService.getAllProjectMetadata).mockResolvedValue(localProjects);
    vi.mocked(cloudStorageService.getAllProjectMetadata).mockResolvedValue([]);

    const result = await hybridStorageService.getAllProjectMetadata();

    expect(result).toEqual(localProjects);
  });

  it('saves locally and to cloud when authenticated', async () => {
    hybridStorageService.setAuthenticated('user-1');
    const project = {
      id: 'p1',
      name: 'Project 1',
      description: '',
      files: { 'src/App.tsx': 'export default function App() {}' },
      currentVersionId: 'v1',
      createdAt: '2026-04-05T10:00:00.000Z',
      updatedAt: '2026-04-05T10:00:00.000Z',
      chatMessages: [],
      fileCount: 1,
      thumbnailFiles: ['src/App.tsx'],
    };

    await hybridStorageService.saveProject(project);

    expect(storageService.saveProject).toHaveBeenCalledWith(project);
    expect(cloudStorageService.saveProject).toHaveBeenCalledWith(project);
  });

  it('preserves local save when cloud save fails', async () => {
    hybridStorageService.setAuthenticated('user-1');
    const project = {
      id: 'p2',
      name: 'Project 2',
      description: '',
      files: { 'src/App.tsx': 'export default function App() {}' },
      currentVersionId: 'v1',
      createdAt: '2026-04-05T10:00:00.000Z',
      updatedAt: '2026-04-05T10:00:00.000Z',
      chatMessages: [],
      fileCount: 1,
      thumbnailFiles: ['src/App.tsx'],
    };
    vi.mocked(cloudStorageService.saveProject).mockRejectedValue(new Error('cloud write failed'));

    await expect(hybridStorageService.saveProject(project)).resolves.toBeUndefined();

    expect(storageService.saveProject).toHaveBeenCalledWith(project);
    expect(cloudStorageService.saveProject).toHaveBeenCalledWith(project);
  });
});
