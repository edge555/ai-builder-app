import { createLogger } from '@/utils/logger';
import { stateError } from '@ai-app-builder/shared/utils';

import { getChatMessages, saveChatMessages } from './chat-store';
import { initializeDatabase } from './db-initializer';
import { getMetadata, setMetadata } from './metadata-store';
import {
  saveProjectImmediate,
  getProject,
  getAllProjects,
  getAllProjectMetadata,
  deleteProject,
  renameProject,
  duplicateProject,
} from './project-store';
import { saveTemplate, getAllTemplates, deleteTemplate, getStorageEstimate } from './template-store';
import type { StoredProject, ProjectMetadata, SerializedChatMessage } from './types';
import type { UserTemplate } from './template-types';

const storageLogger = createLogger('Storage');

/**
 * IndexedDB-based storage service for projects.
 * Facade that delegates to focused store modules.
 */
class StorageService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  // Write coalescing: prevents racing between auto-save and manual saves
  private writeInFlight: Map<string, Promise<void>> = new Map();
  private writePending: Map<string, StoredProject> = new Map();

  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    if (this.db) return Promise.resolve();

    this.initPromise = initializeDatabase().then((db) => {
      this.db = db;
    });

    return this.initPromise;
  }

  private async ensureInitialized(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.initialize();
    }
    if (!this.db) {
      throw new Error(stateError('Database', 'failed to initialize'));
    }
    return this.db;
  }

  /**
   * Saves a project to IndexedDB with write coalescing.
   * If a save for this project is already in-flight, the new data is buffered
   * and written after the current save completes (latest wins).
   */
  async saveProject(project: StoredProject): Promise<void> {
    const projectId = project.id;

    if (this.writeInFlight.has(projectId)) {
      this.writePending.set(projectId, project);
      await this.writeInFlight.get(projectId);
      if (this.writeInFlight.has(projectId)) {
        await this.writeInFlight.get(projectId);
      }
      return;
    }

    await this.executeProjectSave(project);
  }

  private async executeProjectSave(project: StoredProject): Promise<void> {
    const projectId = project.id;

    const doSave = async (proj: StoredProject): Promise<void> => {
      try {
        const db = await this.ensureInitialized();
        await saveProjectImmediate(db, proj);
      } catch (error) {
        storageLogger.error('Failed to save project', { error });
      }
    };

    let currentProject = project;
    const flightPromise = (async () => {
      await doSave(currentProject);

      while (this.writePending.has(projectId)) {
        currentProject = this.writePending.get(projectId)!;
        this.writePending.delete(projectId);
        await doSave(currentProject);
      }
    })();

    this.writeInFlight.set(projectId, flightPromise);

    try {
      await flightPromise;
    } finally {
      this.writeInFlight.delete(projectId);
    }
  }

  async getProject(id: string): Promise<StoredProject | undefined> {
    const db = await this.ensureInitialized();
    return getProject(db, id);
  }

  async getChatMessages(projectId: string): Promise<SerializedChatMessage[]> {
    const db = await this.ensureInitialized();
    return getChatMessages(db, projectId);
  }

  async saveChatMessages(projectId: string, messages: SerializedChatMessage[]): Promise<void> {
    const db = await this.ensureInitialized();
    return saveChatMessages(db, projectId, messages);
  }

  async getAllProjects(options?: { offset?: number; limit?: number }): Promise<StoredProject[]> {
    const db = await this.ensureInitialized();
    return getAllProjects(db, options);
  }

  async getAllProjectMetadata(options?: {
    offset?: number;
    limit?: number;
  }): Promise<ProjectMetadata[]> {
    const db = await this.ensureInitialized();
    return getAllProjectMetadata(db, options);
  }

  async deleteProject(id: string): Promise<void> {
    const db = await this.ensureInitialized();
    return deleteProject(db, id);
  }

  async renameProject(id: string, newName: string): Promise<void> {
    const db = await this.ensureInitialized();
    return renameProject(db, id, newName);
  }

  async duplicateProject(id: string): Promise<StoredProject> {
    const db = await this.ensureInitialized();
    return duplicateProject(db, id, this.saveProject.bind(this));
  }

  async getMetadata(key: string): Promise<unknown> {
    const db = await this.ensureInitialized();
    return getMetadata(db, key);
  }

  async setMetadata(key: string, value: unknown): Promise<void> {
    const db = await this.ensureInitialized();
    return setMetadata(db, key, value);
  }

  async saveTemplate(template: UserTemplate): Promise<void> {
    const db = await this.ensureInitialized();
    return saveTemplate(db, template);
  }

  async getAllTemplates(): Promise<UserTemplate[]> {
    const db = await this.ensureInitialized();
    return getAllTemplates(db);
  }

  async deleteTemplate(id: string): Promise<void> {
    const db = await this.ensureInitialized();
    return deleteTemplate(db, id);
  }

  async getStorageEstimate(): Promise<StorageEstimate | null> {
    return getStorageEstimate();
  }
}

// Singleton export
export const storageService = new StorageService();
