import { createContext, useContext, type ReactNode } from 'react';
import type {
    SerializedProjectState,
    SerializedVersion,
    FileDiff,
    RuntimeError,
    ChangeSummary
} from '@/shared';
import type { ChatMessage, LoadingPhase } from '../components/ChatInterface';
import type { StreamingState } from '@/hooks/useStreamingGeneration';

/**
 * API configuration for the chat context.
 */
export interface ApiConfig {
    baseUrl: string;
}

/**
 * State managed by the ChatContext.
 */
export interface ChatState {
    messages: ChatMessage[];
    isLoading: boolean;
    loadingPhase: LoadingPhase;
    projectState: SerializedProjectState | null;
    error: string | null;
    /** Whether auto-repair is in progress */
    isAutoRepairing: boolean;
    /** Current auto-repair attempt number */
    autoRepairAttempt: number;
    /** Streaming generation state */
    streamingState: StreamingState | null;
    /** Whether streaming is enabled */
    isStreaming: boolean;
}

/**
 * Callbacks for version integration.
 */
export interface VersionCallbacks {
    onVersionCreated?: (version: SerializedVersion) => void;
    onDiffsComputed?: (diffs: FileDiff[]) => void;
    onProjectStateChanged?: (projectState: SerializedProjectState) => void;
}

/**
 * Actions available through the ChatContext.
 */
export interface ChatActions {
    submitPrompt: (prompt: string) => Promise<void>;
    clearMessages: () => void;
    clearError: () => void;
    setProjectState: (projectState: SerializedProjectState | null) => void;
    setVersionCallbacks: (callbacks: VersionCallbacks) => void;
    /** Trigger auto-repair for a runtime error */
    autoRepair: (runtimeError: RuntimeError) => Promise<boolean>;
    /** Reset auto-repair state */
    resetAutoRepair: () => void;
    /** Undo to previous project state */
    undo: () => void;
    /** Redo to next project state */
    redo: () => void;
    /** Whether undo is available */
    canUndo: boolean;
    /** Whether redo is available */
    canRedo: boolean;
}

/**
 * Combined context value type.
 */
export type ChatContextValue = ChatState & ChatActions;

export const ChatContext = createContext<ChatContextValue | null>(null);

/**
 * Props for the ChatProvider component.
 */
export interface ChatProviderProps {
    children: ReactNode;
    apiConfig?: Partial<ApiConfig>;
    /** Optional initial prompt to submit on mount */
    initialPrompt?: string;
}

/**
 * Hook to access the chat context.
 * Must be used within a ChatProvider.
 */
export function useChat(): ChatContextValue {
    const context = useContext(ChatContext);
    if (!context) {
        throw new Error('useChat must be used within a ChatProvider');
    }
    return context;
}
