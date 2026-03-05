export const DB_NAME = 'ai_app_builder_db';
export const DB_VERSION = 4;
export const PROJECTS_STORE = 'projects';
export const CHAT_MESSAGES_STORE = 'chat_messages';
export const METADATA_STORE = 'metadata';
export const TEMPLATES_STORE = 'user_templates';

// Performance tuning constants
export const CHUNK_SIZE = 50_000; // ~50KB chunks for writes
export const MAX_PROJECTS_PER_PAGE = 50;