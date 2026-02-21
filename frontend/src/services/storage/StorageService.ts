import { createLogger } from '@/utils/logger';

import type { StoredProject, ProjectMetadata, SerializedChatMessage } from './types';

const storageLogger = createLogger('Storage');

/**
 * IndexedDB-based storage service for projects.
 * Provides CRUD operations for project persistence.
 */
class StorageService {
  private readonly DB_NAME = 'ai_app_builder_db';
  private readonly DB_VERSION = 2; // Bumped for chat messages store
  private readonly PROJECTS_STORE = 'projects';
  private readonly CHAT_MESSAGES_STORE = 'chat_messages';
  private readonly METADATA_STORE = 'metadata';

  // Performance tuning constants
  private readonly CHUNK_SIZE = 50_000; // ~50KB chunks for writes
  private readonly MAX_PROJECTS_PER_PAGE = 50;

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
        const oldVersion = event.oldVersion;

        // Version 1: Create projects and metadata stores
        if (oldVersion < 1) {
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
        }

        // Version 2: Create chat messages store and migrate existing data
        if (oldVersion < 2) {
          // Create chat messages store with composite key (projectId + messageId)
          if (!db.objectStoreNames.contains(this.CHAT_MESSAGES_STORE)) {
            const chatStore = db.createObjectStore(this.CHAT_MESSAGES_STORE, {
              keyPath: ['projectId', 'messageId'],
            });
            // Index for efficient project-based queries
            chatStore.createIndex('by-projectId', 'projectId', { unique: false });
          }

          // Migrate existing chat messages from projects to separate store
          const transaction = (event.target as IDBOpenDBRequest).transaction;
          if (transaction) {
            const projectsStore = transaction.objectStore(this.PROJECTS_STORE);
            const chatStore = transaction.objectStore(this.CHAT_MESSAGES_STORE);

            projectsStore.openCursor().onsuccess = (cursorEvent) => {
              const cursor = (cursorEvent.target as IDBRequest).result;
              if (cursor) {
                const project = cursor.value;
                // Migrate chat messages to separate store
                if (project.chatMessages && Array.isArray(project.chatMessages)) {
                  project.chatMessages.forEach((msg: SerializedChatMessage) => {
                    chatStore.put({
                      projectId: project.id,
                      messageId: msg.id,
                      ...msg,
                    });
                  });
                  // Remove chatMessages from project object
                  delete project.chatMessages;
                  cursor.update(project);
                }
                cursor.continue();
              }
            };
          }
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
   * Saves a project to IndexedDB with optimized chunked writes.
   * Chat messages are stored separately for better performance.
   * Updates updatedAt timestamp automatically.
   */
  async saveProject(project: StoredProject): Promise<void> {
    try {
      const db = await this.ensureInitialized();

      // Extract chat messages to save separately
      const { chatMessages, ...projectWithoutMessages } = project;

      // Update the updatedAt timestamp
      const updatedProject = {
        ...projectWithoutMessages,
        updatedAt: new Date().toISOString(),
      };

      // Calculate project size to determine if chunking is needed
      const projectSize = JSON.stringify(updatedProject).length;

      if (projectSize > this.CHUNK_SIZE) {
        // Use chunked write for large projects
        await this.saveProjectChunked(updatedProject);
      } else {
        // Standard write for small projects
        const transaction = db.transaction([this.PROJECTS_STORE], 'readwrite');
        const store = transaction.objectStore(this.PROJECTS_STORE);

        await new Promise<void>((resolve, reject) => {
          const request = store.put(updatedProject);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }

      // Save chat messages separately if provided
      if (chatMessages && chatMessages.length > 0) {
        await this.saveChatMessages(project.id, chatMessages);
      }
    } catch (error) {
      storageLogger.error('Failed to save project', { error });
      // Swallow save errors per plan spec
    }
  }

  /**
   * Saves a large project using chunked writes to avoid blocking UI.
   * Splits the project into metadata and files, then writes files in batches.
   */
  private async saveProjectChunked(
    project: Omit<StoredProject, 'chatMessages'>
  ): Promise<void> {
    const db = await this.ensureInitialized();

    // Split project into metadata and files
    const { files, ...metadata } = project;
    const fileEntries = Object.entries(files);

    // Save metadata first (always small)
    const metaTransaction = db.transaction([this.PROJECTS_STORE], 'readwrite');
    const metaStore = metaTransaction.objectStore(this.PROJECTS_STORE);

    await new Promise<void>((resolve, reject) => {
      const request = metaStore.put({
        ...metadata,
        files: {}, // Start with empty files, will add incrementally
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    // Write files in chunks using multiple transactions
    for (let i = 0; i < fileEntries.length; i += 10) {
      const chunk = fileEntries.slice(i, i + 10);

      // Use requestIdleCallback to yield to browser between chunks
      await new Promise<void>((resolve) => {
        const callback = () => {
          const fileTransaction = db.transaction([this.PROJECTS_STORE], 'readwrite');
          const fileStore = fileTransaction.objectStore(this.PROJECTS_STORE);

          fileStore.get(project.id).onsuccess = (event) => {
            const currentProject = (event.target as IDBRequest).result;
            if (currentProject) {
              // Merge chunk of files
              chunk.forEach(([path, content]) => {
                currentProject.files[path] = content;
              });

              fileStore.put(currentProject).onsuccess = () => resolve();
            }
          };
        };

        if ('requestIdleCallback' in window) {
          requestIdleCallback(callback, { timeout: 100 });
        } else {
          // Fallback for browsers without requestIdleCallback
          setTimeout(callback, 0);
        }
      });
    }
  }

  /**
   * Saves chat messages for a project to the separate chat messages store.
   */
  private async saveChatMessages(
    projectId: string,
    messages: SerializedChatMessage[]
  ): Promise<void> {
    const db = await this.ensureInitialized();
    const transaction = db.transaction([this.CHAT_MESSAGES_STORE], 'readwrite');
    const store = transaction.objectStore(this.CHAT_MESSAGES_STORE);

    // Clear existing messages for this project
    const index = store.index('by-projectId');
    const range = IDBKeyRange.only(projectId);

    await new Promise<void>((resolve, reject) => {
      const clearRequest = index.openCursor(range);

      clearRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };

      clearRequest.onerror = () => reject(clearRequest.error);
    });

    // Add new messages
    for (const message of messages) {
      await new Promise<void>((resolve, reject) => {
        const request = store.put({
          projectId,
          messageId: message.id,
          ...message,
        });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  }

  /**
   * Retrieves a project by ID, including chat messages.
   * Chat messages are loaded lazily from separate store.
   */
  async getProject(id: string): Promise<StoredProject | undefined> {
    try {
      const db = await this.ensureInitialized();
      const transaction = db.transaction([this.PROJECTS_STORE], 'readonly');
      const store = transaction.objectStore(this.PROJECTS_STORE);

      const project = await new Promise<StoredProject | undefined>((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      if (!project) {
        return undefined;
      }

      // Load chat messages separately
      const chatMessages = await this.getChatMessages(id);

      return {
        ...project,
        chatMessages,
      };
    } catch (error) {
      storageLogger.error('Failed to get project', { error });
      return undefined;
    }
  }

  /**
   * Retrieves chat messages for a project.
   * This is called lazily when opening a project.
   */
  async getChatMessages(projectId: string): Promise<SerializedChatMessage[]> {
    try {
      const db = await this.ensureInitialized();
      const transaction = db.transaction([this.CHAT_MESSAGES_STORE], 'readonly');
      const store = transaction.objectStore(this.CHAT_MESSAGES_STORE);
      const index = store.index('by-projectId');

      const messages = await new Promise<SerializedChatMessage[]>((resolve, reject) => {
        const request = index.getAll(projectId);
        request.onsuccess = () => {
          // Remove projectId and messageId from results (they're just keys)
          const results = request.result.map((msg: SerializedChatMessage & { projectId: string; messageId: string }) => {
            const { projectId: _pid, messageId: _mid, ...message } = msg;
            return message as SerializedChatMessage;
          });
          resolve(results);
        };
        request.onerror = () => reject(request.error);
      });

      return messages;
    } catch (error) {
      storageLogger.error('Failed to get chat messages', { error, projectId });
      return [];
    }
  }

  /**
   * Retrieves all projects, sorted by updatedAt (most recent first).
   * WARNING: This loads full projects including files. Use getAllProjectMetadata() for listings.
   *
   * @param options - Pagination options
   * @param options.offset - Number of projects to skip (default: 0)
   * @param options.limit - Maximum number of projects to return (default: unlimited)
   */
  async getAllProjects(options?: {
    offset?: number;
    limit?: number;
  }): Promise<StoredProject[]> {
    try {
      const { offset = 0, limit } = options || {};
      const db = await this.ensureInitialized();
      const transaction = db.transaction([this.PROJECTS_STORE], 'readonly');
      const store = transaction.objectStore(this.PROJECTS_STORE);
      const index = store.index('by-updatedAt');

      const projects = await new Promise<StoredProject[]>((resolve, reject) => {
        const request = index.openCursor(null, 'prev'); // Descending order
        const results: StoredProject[] = [];
        let skipped = 0;

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            // Skip offset entries
            if (skipped < offset) {
              skipped++;
              cursor.continue();
              return;
            }

            // Check limit
            if (limit && results.length >= limit) {
              resolve(results);
              return;
            }

            results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results);
          }
        };

        request.onerror = () => reject(request.error);
      });

      // Load chat messages for each project
      const projectsWithMessages = await Promise.all(
        projects.map(async (project) => ({
          ...project,
          chatMessages: await this.getChatMessages(project.id),
        }))
      );

      return projectsWithMessages;
    } catch (error) {
      storageLogger.error('Failed to get all projects', { error });
      return [];
    }
  }

  /**
   * Retrieves lightweight project metadata for all projects.
   * Optimized for gallery listings - excludes files and chat messages.
   * Sorted by updatedAt (most recent first).
   *
   * @param options - Pagination options
   * @param options.offset - Number of projects to skip (default: 0)
   * @param options.limit - Maximum number of projects to return (default: 50)
   */
  async getAllProjectMetadata(options?: {
    offset?: number;
    limit?: number;
  }): Promise<ProjectMetadata[]> {
    try {
      const { offset = 0, limit = this.MAX_PROJECTS_PER_PAGE } = options || {};
      const db = await this.ensureInitialized();
      const transaction = db.transaction([this.PROJECTS_STORE], 'readonly');
      const store = transaction.objectStore(this.PROJECTS_STORE);
      const index = store.index('by-updatedAt');

      const metadata = await new Promise<ProjectMetadata[]>((resolve, reject) => {
        const request = index.openCursor(null, 'prev'); // Descending order
        const results: ProjectMetadata[] = [];
        let skipped = 0;

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            // Skip offset entries
            if (skipped < offset) {
              skipped++;
              cursor.continue();
              return;
            }

            // Check limit
            if (results.length >= limit) {
              resolve(results);
              return;
            }

            const project = cursor.value;
            // Extract only metadata fields (exclude files and chatMessages)
            results.push({
              id: project.id,
              name: project.name,
              description: project.description,
              currentVersionId: project.currentVersionId,
              createdAt: project.createdAt,
              updatedAt: project.updatedAt,
              fileCount: project.fileCount,
              thumbnailFiles: project.thumbnailFiles,
            });

            cursor.continue();
          } else {
            resolve(results);
          }
        };

        request.onerror = () => reject(request.error);
      });

      return metadata;
    } catch (error) {
      storageLogger.error('Failed to get project metadata', { error });
      return [];
    }
  }

  /**
   * Deletes a project by ID, including associated chat messages.
   */
  async deleteProject(id: string): Promise<void> {
    try {
      const db = await this.ensureInitialized();
      const transaction = db.transaction(
        [this.PROJECTS_STORE, this.CHAT_MESSAGES_STORE],
        'readwrite'
      );
      const projectStore = transaction.objectStore(this.PROJECTS_STORE);
      const chatStore = transaction.objectStore(this.CHAT_MESSAGES_STORE);

      // Delete project
      await new Promise<void>((resolve, reject) => {
        const request = projectStore.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      // Delete associated chat messages
      const index = chatStore.index('by-projectId');
      const range = IDBKeyRange.only(id);

      await new Promise<void>((resolve, reject) => {
        const deleteRequest = index.openCursor(range);

        deleteRequest.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };

        deleteRequest.onerror = () => reject(deleteRequest.error);
      });
    } catch (error) {
      storageLogger.error('Failed to delete project', { error });
      throw error;
    }
  }

  /**
   * Renames a project.
   * Uses a targeted get-and-put within a single transaction to avoid loading
   * and re-saving the full project (files + chat messages).
   */
  async renameProject(id: string, newName: string): Promise<void> {
    try {
      const db = await this.ensureInitialized();
      const transaction = db.transaction([this.PROJECTS_STORE], 'readwrite');
      const store = transaction.objectStore(this.PROJECTS_STORE);

      // Load only the project record (chat messages live in a separate store)
      const record = await new Promise<Omit<StoredProject, 'chatMessages'> | undefined>(
        (resolve, reject) => {
          const request = store.get(id);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        }
      );

      if (!record) {
        throw new Error(`Project ${id} not found`);
      }

      await new Promise<void>((resolve, reject) => {
        const request = store.put({
          ...record,
          name: newName,
          updatedAt: new Date().toISOString(),
        });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
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
  async getMetadata(key: string): Promise<unknown> {
    try {
      const db = await this.ensureInitialized();
      const transaction = db.transaction([this.METADATA_STORE], 'readonly');
      const store = transaction.objectStore(this.METADATA_STORE);

      const result = await new Promise<unknown>((resolve, reject) => {
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
  async setMetadata(key: string, value: unknown): Promise<void> {
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
