import { createLogger } from '@/utils/logger';

import { TEMPLATES_STORE } from './db-constants';
import type { UserTemplate } from './template-types';

const logger = createLogger('Storage');

export async function saveTemplate(db: IDBDatabase, template: UserTemplate): Promise<void> {
  try {
    const transaction = db.transaction([TEMPLATES_STORE], 'readwrite');
    const store = transaction.objectStore(TEMPLATES_STORE);

    await new Promise<void>((resolve, reject) => {
      const request = store.put(template);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    logger.error('Failed to save template', { error });
    throw error;
  }
}

export async function getAllTemplates(db: IDBDatabase): Promise<UserTemplate[]> {
  try {
    const transaction = db.transaction([TEMPLATES_STORE], 'readonly');
    const store = transaction.objectStore(TEMPLATES_STORE);
    const index = store.index('by-createdAt');

    return await new Promise<UserTemplate[]>((resolve, reject) => {
      const request = index.openCursor(null, 'prev');
      const results: UserTemplate[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          results.push(cursor.value as UserTemplate);
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    logger.error('Failed to get templates', { error });
    return [];
  }
}

export async function deleteTemplate(db: IDBDatabase, id: string): Promise<void> {
  try {
    const transaction = db.transaction([TEMPLATES_STORE], 'readwrite');
    const store = transaction.objectStore(TEMPLATES_STORE);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    logger.error('Failed to delete template', { error });
    throw error;
  }
}

export async function getStorageEstimate(): Promise<StorageEstimate | null> {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      return await navigator.storage.estimate();
    }
    return null;
  } catch (error) {
    logger.error('Failed to get storage estimate', { error });
    return null;
  }
}
