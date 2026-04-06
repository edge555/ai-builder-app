import type { RuntimeError, GenerateProjectResponse, ModifyProjectResponse, SerializedProjectState, ImageAttachment } from '@ai-app-builder/shared/types';
import type { AggregatedErrors } from '@/services/ErrorAggregator';
import { createContext, useContext } from 'react';

import type { LoadingPhase } from '../components/ChatInterface';
import type { ModifyProjectOptions, ModifyProjectStreamingOptions, StreamSnapshot } from './generation/types';

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
    streamingState: StreamSnapshot | null;
    isStreaming: boolean;
}

/**
 * Stable generation actions.
 * Components subscribing to this context won't re-render on state changes.
 */
export interface GenerationActionsValue {
    generateProject: (description: string, attachments?: ImageAttachment[]) => Promise<GenerateProjectResponse>;
    generateProjectStreaming: (description: string, attachments?: ImageAttachment[]) => Promise<GenerateProjectResponse>;
    modifyProject: (currentState: SerializedProjectState, prompt: string, runtimeError?: RuntimeError, options?: ModifyProjectOptions) => Promise<ModifyProjectResponse>;
    modifyProjectStreaming: (currentState: SerializedProjectState, prompt: string, runtimeError?: RuntimeError, options?: ModifyProjectStreamingOptions) => Promise<ModifyProjectResponse>;
    autoRepair: (runtimeError: RuntimeError, projectState: SerializedProjectState | null, aggregatedErrors?: AggregatedErrors | null) => Promise<boolean>;
    resetAutoRepair: () => void;
    setIsLoading: (loading: boolean) => void;
    setLoadingPhase: (phase: LoadingPhase) => void;
    clearError: () => void;
    abortCurrentRequest: () => void;
}

export const GenerationStateContext = createContext<GenerationStateValue | null>(null);
export const GenerationActionsContext = createContext<GenerationActionsValue | null>(null);

export function useGenerationState(): GenerationStateValue {
    const context = useContext(GenerationStateContext);
    if (!context) {
        throw new Error('useGenerationState must be used within a GenerationProvider');
    }
    return context;
}

export function useGenerationActions(): GenerationActionsValue {
    const context = useContext(GenerationActionsContext);
    if (!context) {
        throw new Error('useGenerationActions must be used within a GenerationProvider');
    }
    return context;
}

export type { StreamSnapshot as StreamingState } from './generation/types';
