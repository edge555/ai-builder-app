import { notFoundError } from '@ai-app-builder/shared/utils';

import { createLogger } from '@/utils/logger';

import { getChatMessages, saveChatMessages } from './chat-store';
import { PROJECTS_STORE, CHAT_MESSAGES_STORE, CHUNK_SIZE, MAX_PROJECTS_PER_PAGE } from './db-constants';
import type { StoredProject, ProjectMetadata } from './types';

const logger = createLogger('Storage');

export async function saveProjectImmediate(db: IDBDatabase, project: StoredProject): Promise<void> {
  const { chatMessages, ...projectWithoutMessages } = project;

  const updatedProject = {
    ...projectWithoutMessages,
    updatedAt: new Date().toISOString(),
  };

  const projectSize = JSON.stringify(updatedProject).length;

  if (projectSize > CHUNK_SIZE) {
    await saveProjectChunked(db, updatedProject);
  } else {
    const transaction = db.transaction([PROJECTS_STORE], 'readwrite');
    const store = transaction.objectStore(PROJECTS_STORE);

    await new Promise<void>((resolve, reject) => {
      const request = store.put(updatedProject);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  if (chatMessages && chatMessages.length > 0) {
    await saveChatMessages(db, project.id, chatMessages);
  }
}

export async function saveProjectChunked(
  db: IDBDatabase,
  project: Omit<StoredProject, 'chatMessages'>
): Promise<void> {
  const { files, ...metadata } = project;
  const fileEntries = Object.entries(files);

  const metaTransaction = db.transaction([PROJECTS_STORE], 'readwrite');
  const metaStore = metaTransaction.objectStore(PROJECTS_STORE);

  await new Promise<void>((resolve, reject) => {
    const request = metaStore.put({
      ...metadata,
      files: {}, // Start with empty files, will add incrementally
    });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  for (let i = 0; i < fileEntries.length; i += 10) {
    const chunk = fileEntries.slice(i, i + 10);

    await new Promise<void>((resolve) => {
      const callback = () => {
        const fileTransaction = db.transaction([PROJECTS_STORE], 'readwrite');
        const fileStore = fileTransaction.objectStore(PROJECTS_STORE);

        fileStore.get(project.id).onsuccess = (event) => {
          const currentProject = (event.target as IDBRequest).result;
          if (currentProject) {
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
        setTimeout(callback, 0);
      }
    });
  }
}

export async function getProject(db: IDBDatabase, id: string): Promise<StoredProject | undefined> {
  try {
    const transaction = db.transaction([PROJECTS_STORE], 'readonly');
    const store = transaction.objectStore(PROJECTS_STORE);

    const project = await new Promise<StoredProject | undefined>((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (!project) {
      return undefined;
    }

    const chatMessages = await getChatMessages(db, id);
    return { ...project, chatMessages };
  } catch (error) {
    logger.error('Failed to get project', { error });
    return undefined;
  }
}

export async function getAllProjects(
  db: IDBDatabase,
  options?: { offset?: number; limit?: number }
): Promise<StoredProject[]> {
  try {
    const { offset = 0, limit } = options || {};
    const transaction = db.transaction([PROJECTS_STORE], 'readonly');
    const store = transaction.objectStore(PROJECTS_STORE);
    const index = store.index('by-updatedAt');

    const projects = await new Promise<StoredProject[]>((resolve, reject) => {
      const request = index.openCursor(null, 'prev');
      const results: StoredProject[] = [];
      let skipped = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          if (skipped < offset) {
            skipped++;
            cursor.continue();
            return;
          }

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

    return await Promise.all(
      projects.map(async (project) => ({
        ...project,
        chatMessages: await getChatMessages(db, project.id),
      }))
    );
  } catch (error) {
    logger.error('Failed to get all projects', { error });
    return [];
  }
}

export async function getAllProjectMetadata(
  db: IDBDatabase,
  options?: { offset?: number; limit?: number }
): Promise<ProjectMetadata[]> {
  try {
    const { offset = 0, limit = MAX_PROJECTS_PER_PAGE } = options || {};
    const transaction = db.transaction([PROJECTS_STORE], 'readonly');
    const store = transaction.objectStore(PROJECTS_STORE);
    const index = store.index('by-updatedAt');

    const metadata = await new Promise<ProjectMetadata[]>((resolve, reject) => {
      const request = index.openCursor(null, 'prev');
      const results: ProjectMetadata[] = [];
      let skipped = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          if (skipped < offset) {
            skipped++;
            cursor.continue();
            return;
          }

          if (results.length >= limit) {
            resolve(results);
            return;
          }

          const project = cursor.value;
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
    logger.error('Failed to get project metadata', { error });
    return [];
  }
}

export async function deleteProject(db: IDBDatabase, id: string): Promise<void> {
  try {
    const transaction = db.transaction([PROJECTS_STORE, CHAT_MESSAGES_STORE], 'readwrite');
    const projectStore = transaction.objectStore(PROJECTS_STORE);
    const chatStore = transaction.objectStore(CHAT_MESSAGES_STORE);

    await new Promise<void>((resolve, reject) => {
      const request = projectStore.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

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
    logger.error('Failed to delete project', { error });
    throw error;
  }
}

export async function renameProject(db: IDBDatabase, id: string, newName: string): Promise<void> {
  try {
    const transaction = db.transaction([PROJECTS_STORE], 'readwrite');
    const store = transaction.objectStore(PROJECTS_STORE);

    const record = await new Promise<Omit<StoredProject, 'chatMessages'> | undefined>(
      (resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }
    );

    if (!record) {
      throw new Error(notFoundError('Project', id));
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
    logger.error('Failed to rename project', { error });
    throw error;
  }
}

export async function duplicateProject(
  db: IDBDatabase,
  id: string,
  saveFn: (project: StoredProject) => Promise<void>
): Promise<StoredProject> {
  try {
    const project = await getProject(db, id);
    if (!project) {
      throw new Error(notFoundError('Project', id));
    }

    const duplicatedProject: StoredProject = {
      ...project,
      id: crypto.randomUUID(),
      name: `${project.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveFn(duplicatedProject);
    return duplicatedProject;
  } catch (error) {
    logger.error('Failed to duplicate project', { error });
    throw error;
  }
}
