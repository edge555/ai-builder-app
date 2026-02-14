import type { StoredProject } from './types';
import { createLogger } from '@/utils/logger';

const storageLogger = createLogger('Storage');

/**
 * IndexedDB-based storage service for projects.
 * Provides CRUD operations for project persistence.
 */
class StorageService {
  private readonly DB_NAME = 'ai_app_builder_db';
  private readonly DB_VERSION = 1;
  private readonly PROJECTS_STORE = 'projects';
  private readonly METADATA_STORE = 'metadata';

  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initializes the IndexedDB database.
   * Creates object stores and indexes if needed.
   */
  async initialize(): Promise<void> {
    // Return existing initialization if in progress
    if (this.initPromise) {
      return this.initPromise;
    }

    // Return immediately if already initialized
    if (this.db) {
      return Promise.resolve();
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => {
        storageLogger.error('Failed to open IndexedDB', { error: request.error });
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create projects store
        if (!db.objectStoreNames.contains(this.PROJECTS_STORE)) {
          const projectsStore = db.createObjectStore(this.PROJECTS_STORE, {
            keyPath: 'id',
          });
          // Index for sorting by updatedAt
          projectsStore.createIndex('by-updatedAt', 'updatedAt', { unique: false });
        }

        // Create metadata store
        if (!db.objectStoreNames.contains(this.METADATA_STORE)) {
          db.createObjectStore(this.METADATA_STORE, { keyPath: 'key' });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Ensures the database is initialized before operations.
   */
  private async ensureInitialized(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.initialize();
    }
    if (!this.db) {
      throw new Error('Failed to initialize database');
    }
    return this.db;
  }

  /**
   * Saves a project to IndexedDB.
   * Updates updatedAt timestamp automatically.
   */
  async saveProject(project: StoredProject): Promise<void> {
    try {
      const db = await this.ensureInitialized();
      const transaction = db.transaction([this.PROJECTS_STORE], 'readwrite');
      const store = transaction.objectStore(this.PROJECTS_STORE);

      // Update the updatedAt timestamp
      const updatedProject = {
        ...project,
        updatedAt: new Date().toISOString(),
      };

      await new Promise<void>((resolve, reject) => {
        const request = store.put(updatedProject);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      storageLogger.error('Failed to save project', { error });
      // Swallow save errors per plan spec
    }
  }

  /**
   * Retrieves a project by ID.
   */
  async getProject(id: string): Promise<StoredProject | undefined> {
    try {
      const db = await this.ensureInitialized();
      const transaction = db.transaction([this.PROJECTS_STORE], 'readonly');
      const store = transaction.objectStore(this.PROJECTS_STORE);

      return await new Promise<StoredProject | undefined>((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      storageLogger.error('Failed to get project', { error });
      return undefined;
    }
  }

  /**
   * Retrieves all projects, sorted by updatedAt (most recent first).
   */
  async getAllProjects(): Promise<StoredProject[]> {
    try {
      const db = await this.ensureInitialized();
      const transaction = db.transaction([this.PROJECTS_STORE], 'readonly');
      const store = transaction.objectStore(this.PROJECTS_STORE);
      const index = store.index('by-updatedAt');

      const projects = await new Promise<StoredProject[]>((resolve, reject) => {
        const request = index.openCursor(null, 'prev'); // Descending order
        const results: StoredProject[] = [];

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results);
          }
        };

        request.onerror = () => reject(request.error);
      });

      return projects;
    } catch (error) {
      storageLogger.error('Failed to get all projects', { error });
      return [];
    }
  }

  /**
   * Deletes a project by ID.
   */
  async deleteProject(id: string): Promise<void> {
    try {
      const db = await this.ensureInitialized();
      const transaction = db.transaction([this.PROJECTS_STORE], 'readwrite');
      const store = transaction.objectStore(this.PROJECTS_STORE);

      await new Promise<void>((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      storageLogger.error('Failed to delete project', { error });
      throw error;
    }
  }

  /**
   * Renames a project.
   */
  async renameProject(id: string, newName: string): Promise<void> {
    try {
      const project = await this.getProject(id);
      if (!project) {
        throw new Error(`Project ${id} not found`);
      }

      await this.saveProject({
        ...project,
        name: newName,
      });
    } catch (error) {
      storageLogger.error('Failed to rename project', { error });
      throw error;
    }
  }

  /**
   * Duplicates a project with a new ID and name.
   */
  async duplicateProject(id: string): Promise<StoredProject> {
    try {
      const project = await this.getProject(id);
      if (!project) {
        throw new Error(`Project ${id} not found`);
      }

      const newId = crypto.randomUUID();
      const duplicatedProject: StoredProject = {
        ...project,
        id: newId,
        name: `${project.name} (Copy)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await this.saveProject(duplicatedProject);
      return duplicatedProject;
    } catch (error) {
      storageLogger.error('Failed to duplicate project', { error });
      throw error;
    }
  }

  /**
   * Retrieves a metadata value by key.
   */
  async getMetadata(key: string): Promise<any> {
    try {
      const db = await this.ensureInitialized();
      const transaction = db.transaction([this.METADATA_STORE], 'readonly');
      const store = transaction.objectStore(this.METADATA_STORE);

      const result = await new Promise<any>((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result?.value);
        request.onerror = () => reject(request.error);
      });

      return result;
    } catch (error) {
      storageLogger.error('Failed to get metadata', { error });
      return undefined;
    }
  }

  /**
   * Sets a metadata value by key.
   */
  async setMetadata(key: string, value: any): Promise<void> {
    try {
      const db = await this.ensureInitialized();
      const transaction = db.transaction([this.METADATA_STORE], 'readwrite');
      const store = transaction.objectStore(this.METADATA_STORE);

      await new Promise<void>((resolve, reject) => {
        const request = store.put({ key, value });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      storageLogger.error('Failed to set metadata', { error });
      throw error;
    }
  }

  /**
   * Gets storage quota and usage estimate.
   */
  async getStorageEstimate(): Promise<StorageEstimate | null> {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        return await navigator.storage.estimate();
      }
      return null;
    } catch (error) {
      storageLogger.error('Failed to get storage estimate', { error });
      return null;
    }
  }
}

// Singleton export
export const storageService = new StorageService();
