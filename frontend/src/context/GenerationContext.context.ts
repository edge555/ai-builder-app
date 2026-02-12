import { createContext, useContext } from 'react';
import type { LoadingPhase } from '../components/ChatInterface';
import type { RuntimeError, GenerateProjectResponse, ModifyProjectResponse, SerializedProjectState } from '@/shared';

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
 * Generation context value.
 */
export interface GenerationContextValue {
    isLoading: boolean;
    loadingPhase: LoadingPhase;
    error: string | null;
    isAutoRepairing: boolean;
    autoRepairAttempt: number;
    streamingState: StreamingState | null;
    isStreaming: boolean;
    generateProject: (description: string) => Promise<GenerateProjectResponse>;
    generateProjectStreaming: (description: string) => Promise<GenerateProjectResponse>;
    modifyProject: (currentState: SerializedProjectState, prompt: string, runtimeError?: RuntimeError) => Promise<ModifyProjectResponse>;
    autoRepair: (runtimeError: RuntimeError, projectState: SerializedProjectState | null) => Promise<boolean>;
    resetAutoRepair: () => void;
    setIsLoading: (loading: boolean) => void;
    setLoadingPhase: (phase: LoadingPhase) => void;
    clearError: () => void;
}

export const GenerationContext = createContext<GenerationContextValue | null>(null);

/**
 * Hook to access the generation context.
 * Must be used within a GenerationProvider.
 */
export function useGeneration(): GenerationContextValue {
    const context = useContext(GenerationContext);
    if (!context) {
        throw new Error('useGeneration must be used within a GenerationProvider');
    }
    return context;
}
