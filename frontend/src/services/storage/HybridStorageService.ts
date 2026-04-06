import { createLogger } from '@/utils/logger';
import { cloudStorageService } from '@/services/cloud/CloudStorageService';
import { storageService } from './StorageService';
import type { StoredProject, ProjectMetadata, SerializedChatMessage } from './types';

const logger = createLogger('HybridStorage');

/**
 * Hybrid storage that delegates to Supabase (authenticated) or IndexedDB (anonymous).
 * When authenticated: writes to Supabase with write-through to IndexedDB.
 * When anonymous: writes to IndexedDB only.
 */
class HybridStorageService {
    private userId: string | null = null;
    private readonly namingDescriptors = ['Bright', 'Clever', 'Fresh', 'Modern', 'Quick', 'Sharp', 'Smart', 'Swift'];
    private readonly namingSuffixes = ['Board', 'Desk', 'Forge', 'Hub', 'Lab', 'Studio', 'Works', 'Workshop'];

    private getUpdatedAtTime(project: ProjectMetadata): number {
        const timestamp = new Date(project.updatedAt).getTime();
        return Number.isFinite(timestamp) ? timestamp : 0;
    }

    private get isAuthenticated(): boolean {
        return this.userId !== null;
    }

    setAuthenticated(userId: string | null): void {
        this.userId = userId;
        logger.info('Storage mode changed', { authenticated: !!userId });
    }

    async initialize(): Promise<void> {
        await storageService.initialize();
    }

    async saveProject(project: StoredProject): Promise<void> {
        // Always write to IndexedDB (local cache)
        await storageService.saveProject(project);

        if (this.isAuthenticated) {
            try {
                await cloudStorageService.saveProject(project);
            } catch (error) {
                logger.error('Cloud save failed, local copy preserved', { error });
            }
        }
    }

    async getProject(id: string): Promise<StoredProject | undefined> {
        if (this.isAuthenticated) {
            try {
                const cloud = await cloudStorageService.getProject(id);
                if (cloud) return cloud;
            } catch (error) {
                logger.error('Cloud fetch failed, falling back to local', { error });
            }
        }
        return storageService.getProject(id);
    }

    async getAllProjectMetadata(): Promise<ProjectMetadata[]> {
        if (this.isAuthenticated) {
            try {
                const [cloudProjects, localProjects] = await Promise.all([
                    cloudStorageService.getAllProjectMetadata(),
                    storageService.getAllProjectMetadata(),
                ]);

                // Preserve local projects for authenticated users when cloud state
                // is still empty or only partially synced.
                const merged = new Map<string, ProjectMetadata>();
                for (const project of [...localProjects, ...cloudProjects]) {
                    const existing = merged.get(project.id);
                    if (!existing || this.getUpdatedAtTime(project) >= this.getUpdatedAtTime(existing)) {
                        merged.set(project.id, project);
                    }
                }

                return Array.from(merged.values()).sort(
                    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                );
            } catch (error) {
                logger.error('Cloud metadata fetch failed, falling back to local', { error });
            }
        }
        return storageService.getAllProjectMetadata();
    }

    async getUniqueProjectName(baseName: string): Promise<string> {
        const trimmedBaseName = baseName.trim().replace(/\s+/g, ' ');
        const fallbackBaseName = trimmedBaseName || 'Fresh Project Studio';
        const existingProjects = await this.getAllProjectMetadata();
        const existingNames = new Set(existingProjects.map((project) => project.name.trim().toLowerCase()));

        if (!existingNames.has(fallbackBaseName.toLowerCase())) {
            return fallbackBaseName;
        }

        const words = fallbackBaseName.split(' ').filter(Boolean);
        const [originalDescriptor, originalDomain = 'Project', originalSuffix = 'Studio'] = [
            words[0] || 'Fresh',
            words[1] || 'Project',
            words[2] || 'Studio',
        ];

        for (const descriptor of this.namingDescriptors) {
            if (descriptor === originalDescriptor) {
                continue;
            }

            const candidate = `${descriptor} ${originalDomain} ${originalSuffix}`;
            if (!existingNames.has(candidate.toLowerCase())) {
                return candidate;
            }
        }

        for (const suffix of this.namingSuffixes) {
            if (suffix === originalSuffix) {
                continue;
            }

            const candidate = `${originalDescriptor} ${originalDomain} ${suffix}`;
            if (!existingNames.has(candidate.toLowerCase())) {
                return candidate;
            }
        }

        let suffixNumber = 2;
        while (existingNames.has(`${fallbackBaseName} ${suffixNumber}`.toLowerCase())) {
            suffixNumber++;
        }

        return `${fallbackBaseName} ${suffixNumber}`;
    }

    async deleteProject(id: string): Promise<void> {
        await storageService.deleteProject(id);

        if (this.isAuthenticated) {
            try {
                await cloudStorageService.deleteProject(id);
            } catch (error) {
                logger.error('Cloud delete failed', { error });
            }
        }
    }

    async renameProject(id: string, newName: string): Promise<void> {
        await storageService.renameProject(id, newName);

        if (this.isAuthenticated) {
            try {
                await cloudStorageService.renameProject(id, newName);
            } catch (error) {
                logger.error('Cloud rename failed', { error });
            }
        }
    }

    async duplicateProject(id: string): Promise<StoredProject> {
        const local = await storageService.duplicateProject(id);

        if (this.isAuthenticated) {
            try {
                await cloudStorageService.duplicateProject(id);
            } catch (error) {
                logger.error('Cloud duplicate failed', { error });
            }
        }

        return local;
    }

    async setMetadata(key: string, value: unknown): Promise<void> {
        return storageService.setMetadata(key, value);
    }

    async getMetadata(key: string): Promise<unknown> {
        return storageService.getMetadata(key);
    }

    async saveChatMessages(projectId: string, messages: SerializedChatMessage[]): Promise<void> {
        await storageService.saveChatMessages(projectId, messages);

        if (this.isAuthenticated) {
            try {
                await cloudStorageService.saveChatMessages(projectId, messages);
            } catch (error) {
                logger.error('Cloud chat save failed', { error });
            }
        }
    }

    async getChatMessages(projectId: string): Promise<SerializedChatMessage[]> {
        if (this.isAuthenticated) {
            try {
                return await cloudStorageService.getChatMessages(projectId);
            } catch (error) {
                logger.error('Cloud chat fetch failed, falling back to local', { error });
            }
        }
        return storageService.getChatMessages(projectId);
    }
}

export const hybridStorageService = new HybridStorageService();
