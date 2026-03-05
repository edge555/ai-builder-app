import { createLogger } from '@/utils/logger';

import { CHAT_MESSAGES_STORE } from './db-constants';
import type { SerializedChatMessage } from './types';

const logger = createLogger('Storage');

export async function saveChatMessages(
  db: IDBDatabase,
  projectId: string,
  messages: SerializedChatMessage[]
): Promise<void> {
  const transaction = db.transaction([CHAT_MESSAGES_STORE], 'readwrite');
  const store = transaction.objectStore(CHAT_MESSAGES_STORE);

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

export async function getChatMessages(
  db: IDBDatabase,
  projectId: string
): Promise<SerializedChatMessage[]> {
  try {
    const transaction = db.transaction([CHAT_MESSAGES_STORE], 'readonly');
    const store = transaction.objectStore(CHAT_MESSAGES_STORE);
    const index = store.index('by-projectId');

    const messages = await new Promise<SerializedChatMessage[]>((resolve, reject) => {
      const request = index.getAll(projectId);
      request.onsuccess = () => {
        const results = request.result.map(
          (msg: SerializedChatMessage & { projectId: string; messageId: string }) => {
            const { projectId: _pid, messageId: _mid, ...message } = msg;
            return message as SerializedChatMessage;
          }
        );
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });

    return messages;
  } catch (error) {
    logger.error('Failed to get chat messages', { error, projectId });
    return [];
  }
}
