import type { RuntimeError, GenerateProjectResponse, ModifyProjectResponse, SerializedProjectState, ImageAttachment } from '@ai-app-builder/shared/types';
import type { ConversationTurn } from '@ai-app-builder/shared';
import type { AggregatedErrors } from '@/services/ErrorAggregator';
import { createContext, useContext } from 'react';

import type { LoadingPhase } from '../components/ChatInterface';

export type StreamingPhase = 'idle' | 'connecting' | 'generating' | 'processing' | 'complete' | 'error';

export interface StreamingWarning {
    path: string;
    message: string;
    type: 'formatting' | 'validation';
}

export interface StreamingSummary {
    totalFiles: number;
    successfulFiles: number;
    failedFiles: number;
    warnings: number;
}

export interface StreamingState {
    phase: StreamingPhase;
    progressLabel: string | null;
    files: Record<string, string>;
    currentFile: string | null;
    filesReceived: number;
    totalFiles: number;
    textLength: number;
    error: string | null;
    lastHeartbeat: number | null;
    warnings: StreamingWarning[];
    summary: StreamingSummary | null;
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
    generateProject: (description: string, attachments?: ImageAttachment[]) => Promise<GenerateProjectResponse>;
    generateProjectStreaming: (description: string, attachments?: ImageAttachment[]) => Promise<GenerateProjectResponse>;
    modifyProject: (currentState: SerializedProjectState, prompt: string, runtimeError?: RuntimeError, options?: { shouldSkipPlanning?: boolean; conversationHistory?: ConversationTurn[]; attachments?: ImageAttachment[] }) => Promise<ModifyProjectResponse>;
    modifyProjectStreaming: (currentState: SerializedProjectState, prompt: string, runtimeError?: RuntimeError, options?: { shouldSkipPlanning?: boolean; conversationHistory?: ConversationTurn[]; errorContext?: { affectedFiles: string[]; errorType: string }; attachments?: ImageAttachment[] }) => Promise<ModifyProjectResponse>;
    autoRepair: (runtimeError: RuntimeError, projectState: SerializedProjectState | null, aggregatedErrors?: AggregatedErrors | null) => Promise<boolean>;
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

