/**
 * ChatContext - Legacy Compatibility Export
 * 
 * This file now re-exports the new split context architecture via a compatibility layer.
 * The old monolithic ChatContext has been split into:
 * - ProjectContext (project state, undo/redo)
 * - ChatMessagesContext (message history)
 * - GenerationContext (loading, streaming, API calls)
 * - AutoRepairContext (unified auto-repair coordination)
 * 
 * For backwards compatibility, we export the legacy wrapper that provides the same interface.
 */

export { ChatProvider } from './ChatContextLegacy';
export { useChat } from './ChatContext.context';
export type { ChatContextValue, ChatProviderProps, VersionCallbacks, ApiConfig } from './ChatContext.context';