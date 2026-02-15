import { createContext, useContext } from 'react';
import type { LoadingPhase } from '../components/ChatInterface';
import type { RuntimeError, GenerateProjectResponse, ModifyProjectResponse, SerializedProjectState } from '@ai-app-builder/shared/types';

export type StreamingPhase = 'idle' | 'connecting' | 'generating' | 'processing' | 'complete' | 'error';

export interface StreamingState {
    phase: StreamingPhase;
    files: Record<string, string>;
    currentFile: string | null;
    filesReceived: number;
    totalFiles: number;
    textLength: number;
    error: string | null;
    lastHeartbeat: number | null;
}

/**
 * Read-only generation state.
 * Components subscribing to this context will only re-render when state changes.
 */
export interface GenerationStateValue {
    isLoading: boolean;
    loadingPhase: LoadingPhase;
    error: string | null;
    isAutoRepairing: boolean;
    autoRepairAttempt: number;
    streamingState: StreamingState | null;
    isStreaming: boolean;
}

/**
 * Stable generation actions.
 * Components subscribing to this context won't re-render on state changes.
 */
export interface GenerationActionsValue {
    generateProject: (description: string) => Promise<GenerateProjectResponse>;
    generateProjectStreaming: (description: string) => Promise<GenerateProjectResponse>;
    modifyProject: (currentState: SerializedProjectState, prompt: string, runtimeError?: RuntimeError) => Promise<ModifyProjectResponse>;
    autoRepair: (runtimeError: RuntimeError, projectState: SerializedProjectState | null) => Promise<boolean>;
    resetAutoRepair: () => void;
    setIsLoading: (loading: boolean) => void;
    setLoadingPhase: (phase: LoadingPhase) => void;
    clearError: () => void;
    abortCurrentRequest: () => void;
}

/**
 * Combined generation context value (for backward compatibility).
 */
export interface GenerationContextValue extends GenerationStateValue, GenerationActionsValue { }

export const GenerationStateContext = createContext<GenerationStateValue | null>(null);
export const GenerationActionsContext = createContext<GenerationActionsValue | null>(null);
export const GenerationContext = createContext<GenerationContextValue | null>(null);

/**
 * Hook to access generation state only.
 * Components using this won't re-render when actions change.
 */
export function useGenerationState(): GenerationStateValue {
    const context = useContext(GenerationStateContext);
    if (!context) {
        throw new Error('useGenerationState must be used within a GenerationProvider');
    }
    return context;
}

/**
 * Hook to access generation actions only.
 * Components using this won't re-render when state changes.
 */
export function useGenerationActions(): GenerationActionsValue {
    const context = useContext(GenerationActionsContext);
    if (!context) {
        throw new Error('useGenerationActions must be used within a GenerationProvider');
    }
    return context;
}

/**
 * Hook to access the full generation context (state + actions).
 * Must be used within a GenerationProvider.
 * @deprecated Prefer using useGenerationState() or useGenerationActions() to reduce re-renders.
 */
export function useGeneration(): GenerationContextValue {
    const context = useContext(GenerationContext);
    if (!context) {
        throw new Error('useGeneration must be used within a GenerationProvider');
    }
    return context;
}
