import type {
    GenerateProjectResponse,
    ImageAttachment,
    ModifyProjectResponse,
    RepairAttempt,
    RuntimeError,
    SerializedProjectState,
} from '@ai-app-builder/shared/types';
import type { ConversationTurn } from '@ai-app-builder/shared';
import type { AggregatedErrors, ErrorAggregator } from '@/services/ErrorAggregator';

export type GenerationOperation = 'generate' | 'modify' | 'repair';
export type StreamSnapshotPhase = 'idle' | 'connecting' | 'generating' | 'processing' | 'complete' | 'error';

export interface StreamWarning {
    path: string;
    message: string;
    type: 'formatting' | 'validation';
}

export interface StreamSummary {
    totalFiles: number;
    successfulFiles: number;
    failedFiles: number;
    warnings: number;
}

export interface StreamSnapshot {
    phase: StreamSnapshotPhase;
    progressLabel: string | null;
    isDegraded: boolean;
    files: Record<string, string>;
    currentFile: string | null;
    filesReceived: number;
    totalFiles: number;
    textLength: number;
    error: string | null;
    lastHeartbeat: number | null;
    warnings: StreamWarning[];
    summary: StreamSummary | null;
}

export interface StreamLifecycleOptions {
    inactivityTimeoutMs: number;
    maxTimeoutMs: number;
}

export interface ModifyProjectOptions {
    shouldSkipPlanning?: boolean;
    conversationHistory?: ConversationTurn[];
    attachments?: ImageAttachment[];
}

export interface ModifyProjectStreamingOptions extends ModifyProjectOptions {
    errorContext?: {
        affectedFiles: string[];
        errorType: string;
    };
    repairAttempt?: number;
}

export interface RepairExecutionOptions {
    runtimeError: RuntimeError;
    projectState: SerializedProjectState | null;
    aggregatedErrors?: AggregatedErrors | null;
}

export interface RepairExecutionResult {
    executed: boolean;
    success: boolean;
    attempt: number;
    partialSuccess?: boolean;
    rolledBackFiles?: string[];
    error?: string;
    explanation?: string;
}

export interface OperationResult<TResponse extends GenerateProjectResponse | ModifyProjectResponse> {
    operation: GenerationOperation;
    response: TResponse;
}

export interface StreamSession<TResponse extends GenerateProjectResponse | ModifyProjectResponse> {
    abort: () => void;
    controller: AbortController;
    result: Promise<TResponse>;
}

export interface RepairExecutionRequest {
    prompt: string;
    runtimeError: RuntimeError;
    projectState: SerializedProjectState;
    options: ModifyProjectStreamingOptions;
}

export interface RepairExecutionDependencies {
    errorAggregator: ErrorAggregator;
    executeRepair: (request: RepairExecutionRequest) => Promise<ModifyProjectResponse>;
    onAttemptStart?: (attempt: number) => void;
    onAttemptFinish?: () => void;
    maxAttempts?: number;
}

export type RepairFailureHistory = RepairAttempt[];
