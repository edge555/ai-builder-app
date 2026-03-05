import { createLogger } from '@/utils/logger';

import { METADATA_STORE } from './db-constants';

const logger = createLogger('Storage');

export async function getMetadata(db: IDBDatabase, key: string): Promise<unknown> {
  try {
    const transaction = db.transaction([METADATA_STORE], 'readonly');
    const store = transaction.objectStore(METADATA_STORE);

    return await new Promise<unknown>((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.value);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    logger.error('Failed to get metadata', { error });
    return undefined;
  }
}

export async function setMetadata(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  try {
    const transaction = db.transaction([METADATA_STORE], 'readwrite');
    const store = transaction.objectStore(METADATA_STORE);

    await new Promise<void>((resolve, reject) => {
      const request = store.put({ key, value });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    logger.error('Failed to set metadata', { error });
    throw error;
  }
}
