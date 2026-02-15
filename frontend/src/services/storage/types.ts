import type { SerializedProjectState, ChangeSummary, FileDiff } from '@ai-app-builder/shared/types';

import type { ChatMessage } from '@/components/ChatInterface/ChatInterface';

/**
 * Represents a stored project in IndexedDB.
 * Contains all project state plus chat history.
 */
export interface StoredProject {
  /** Unique identifier (from SerializedProjectState.id) */
  id: string;
  /** Human-readable project name */
  name: string;
  /** Project description */
  description: string;
  /** Map of file paths to file contents */
  files: Record<string, string>;
  /** ID of the current version */
  currentVersionId: string;
  /** ISO timestamp when project was created */
  createdAt: string;
  /** ISO timestamp when project was last updated */
  updatedAt: string;
  /** Chat message history (serialized) */
  chatMessages: SerializedChatMessage[];
  /** Denormalized file count for gallery display */
  fileCount: number;
  /** First 3-5 filenames for gallery preview */
  thumbnailFiles: string[];
}

/**
 * Lightweight project metadata for gallery listings.
 * Excludes files and chat messages for better performance.
 */
export interface ProjectMetadata {
  /** Unique identifier */
  id: string;
  /** Human-readable project name */
  name: string;
  /** Project description */
  description: string;
  /** ID of the current version */
  currentVersionId: string;
  /** ISO timestamp when project was created */
  createdAt: string;
  /** ISO timestamp when project was last updated */
  updatedAt: string;
  /** Denormalized file count for gallery display */
  fileCount: number;
  /** First 3-5 filenames for gallery preview */
  thumbnailFiles: string[];
}

/**
 * Serialized version of ChatMessage for storage.
 * Converts Date to ISO string.
 */
export interface SerializedChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** ISO timestamp string (ChatMessage.timestamp is Date) */
  timestamp: string;
  changeSummary?: ChangeSummary;
  diffs?: FileDiff[];
  isError?: boolean;
}

/**
 * Converts a SerializedProjectState and chat messages to a StoredProject.
 */
export function toStoredProject(
  projectState: SerializedProjectState,
  chatMessages: ChatMessage[]
): StoredProject {
  const fileCount = Object.keys(projectState.files).length;
  const thumbnailFiles = Object.keys(projectState.files).slice(0, 5);

  return {
    id: projectState.id,
    name: projectState.name,
    description: projectState.description,
    files: projectState.files,
    currentVersionId: projectState.currentVersionId,
    createdAt: projectState.createdAt,
    updatedAt: projectState.updatedAt,
    chatMessages: serializeChatMessages(chatMessages),
    fileCount,
    thumbnailFiles,
  };
}

/**
 * Converts a StoredProject back to SerializedProjectState.
 */
export function toSerializedProjectState(
  storedProject: StoredProject
): SerializedProjectState {
  return {
    id: storedProject.id,
    name: storedProject.name,
    description: storedProject.description,
    files: storedProject.files,
    currentVersionId: storedProject.currentVersionId,
    createdAt: storedProject.createdAt,
    updatedAt: storedProject.updatedAt,
  };
}

/**
 * Serializes chat messages for storage.
 * Converts Date timestamp to ISO string.
 */
export function serializeChatMessages(
  messages: ChatMessage[]
): SerializedChatMessage[] {
  return messages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp.toISOString(),
    changeSummary: msg.changeSummary,
    diffs: msg.diffs,
    isError: msg.isError,
  }));
}

/**
 * Deserializes chat messages from storage.
 * Converts ISO string back to Date timestamp.
 */
export function deserializeChatMessages(
  serialized: SerializedChatMessage[]
): ChatMessage[] {
  return serialized.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.timestamp),
    changeSummary: msg.changeSummary,
    diffs: msg.diffs,
    isError: msg.isError,
  }));
}
