import { createLogger } from '@/utils/logger';

import type { SerializedChatMessage } from './types';
import {
  DB_NAME,
  DB_VERSION,
  PROJECTS_STORE,
  CHAT_MESSAGES_STORE,
  METADATA_STORE,
  TEMPLATES_STORE,
} from './db-constants';

const logger = createLogger('Storage');

export function initializeDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      logger.error('Failed to open IndexedDB', { error: request.error });
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      // Version 1: Create projects and metadata stores
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
          const projectsStore = db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
          projectsStore.createIndex('by-updatedAt', 'updatedAt', { unique: false });
        }

        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          db.createObjectStore(METADATA_STORE, { keyPath: 'key' });
        }
      }

      // Version 2: Create chat messages store and migrate existing data
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(CHAT_MESSAGES_STORE)) {
          const chatStore = db.createObjectStore(CHAT_MESSAGES_STORE, {
            keyPath: ['projectId', 'messageId'],
          });
          chatStore.createIndex('by-projectId', 'projectId', { unique: false });
        }

        const transaction = (event.target as IDBOpenDBRequest).transaction as IDBTransaction;
        if (transaction) {
          const projectsStore = transaction.objectStore(PROJECTS_STORE);
          const chatStore = transaction.objectStore(CHAT_MESSAGES_STORE);

          projectsStore.openCursor().onsuccess = (cursorEvent) => {
            const cursor = (cursorEvent.target as IDBRequest).result;
            if (cursor) {
              const project = cursor.value;
              if (project.chatMessages && Array.isArray(project.chatMessages)) {
                project.chatMessages.forEach((msg: SerializedChatMessage) => {
                  chatStore.put({ projectId: project.id, messageId: msg.id, ...msg });
                });
                delete project.chatMessages;
                cursor.update(project);
              }
              cursor.continue();
            }
          };
        }
      }

      // Version 3: Create user_templates store
      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains(TEMPLATES_STORE)) {
          const templatesStore = db.createObjectStore(TEMPLATES_STORE, { keyPath: 'id' });
          templatesStore.createIndex('by-createdAt', 'createdAt', { unique: false });
        }
      }
    };
  });
}
