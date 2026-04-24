import type { GenerateProjectResponse, ModifyProjectResponse } from '@ai-app-builder/shared/types';
import { getUserFriendlyErrorMessage } from '@/utils/error-messages';
import {
    parseSSEStream,
    type StreamCompleteData,
    type StreamErrorData,
    type StreamFileData,
    type StreamProgressData,
} from '@/utils/sse-parser';

import type {
    StreamLifecycleOptions,
    StreamSession,
    StreamSnapshot,
    StreamSummary,
    StreamWarning,
} from './types';

const DEFAULT_LIFECYCLE: StreamLifecycleOptions = {
    inactivityTimeoutMs: 120_000,
    maxTimeoutMs: 900_000,
};

interface StreamSessionConfig<TResponse extends GenerateProjectResponse | ModifyProjectResponse> {
    request: (controller: AbortController) => Promise<Response>;
    lifecycle?: Partial<StreamLifecycleOptions>;
    onResponse?: (response: Response) => void;
    onSnapshot?: (snapshot: StreamSnapshot) => void;
    mapResult?: (baseResult: GenerateProjectResponse, completeData?: StreamCompleteData) => TResponse;
    cancelMessage: string;
    timeoutMessage: string;
}

export function createInitialStreamSnapshot(): StreamSnapshot {
    return {
        phase: 'connecting',
        progressLabel: null,
        isDegraded: false,
        files: {},
        currentFile: null,
        filesReceived: 0,
        totalFiles: 0,
        textLength: 0,
        error: null,
        lastHeartbeat: Date.now(),
        warnings: [],
        summary: null,
    };
}

export function createStreamSession<TResponse extends GenerateProjectResponse | ModifyProjectResponse>(
    config: StreamSessionConfig<TResponse>
): StreamSession<TResponse> {
    const controller = new AbortController();
    const lifecycle = { ...DEFAULT_LIFECYCLE, ...config.lifecycle };
    let timeoutTriggered = false;
    let inactivityTimeoutId: ReturnType<typeof setTimeout> | undefined;
    let maxTimeoutId: ReturnType<typeof setTimeout> | undefined;
    let snapshot = createInitialStreamSnapshot();

    const emitSnapshot = () => {
        config.onSnapshot?.(snapshot);
    };

    const resetInactivityTimeout = () => {
        clearTimeout(inactivityTimeoutId);
        inactivityTimeoutId = setTimeout(() => {
            timeoutTriggered = true;
            controller.abort();
        }, lifecycle.inactivityTimeoutMs);
    };

    const touchSnapshot = (updater: (current: StreamSnapshot) => StreamSnapshot) => {
        snapshot = updater(snapshot);
        emitSnapshot();
    };

    emitSnapshot();
    resetInactivityTimeout();
    maxTimeoutId = setTimeout(() => {
        timeoutTriggered = true;
        controller.abort();
    }, lifecycle.maxTimeoutMs);

    const result = (async () => {
        let completeData: StreamCompleteData | undefined;

        try {
            const response = await config.request(controller);
            config.onResponse?.(response);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || `HTTP ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No response body');
            }

            const baseResult = await parseSSEStream(reader, {
                onStart: () => {
                    resetInactivityTimeout();
                    touchSnapshot(current => ({
                        ...current,
                        phase: 'generating',
                        lastHeartbeat: Date.now(),
                    }));
                },
                onProgress: (progressData: StreamProgressData) => {
                    resetInactivityTimeout();
                    touchSnapshot(current => ({
                        ...current,
                        textLength: progressData.length ?? current.textLength,
                        progressLabel: progressData.label ?? current.progressLabel,
                        isDegraded: progressData.isDegraded ?? current.isDegraded,
                        lastHeartbeat: Date.now(),
                    }));
                },
                onFile: (data: StreamFileData, files: Record<string, string>) => {
                    resetInactivityTimeout();
                    touchSnapshot(current => ({
                        ...current,
                        phase: 'processing',
                        progressLabel: null,
                        files: { ...files },
                        currentFile: data.path,
                        filesReceived: data.index + 1,
                        totalFiles: data.total,
                        lastHeartbeat: Date.now(),
                    }));
                },
                onWarning: (warning: StreamWarning) => {
                    resetInactivityTimeout();
                    touchSnapshot(current => ({
                        ...current,
                        warnings: [...current.warnings, warning],
                        lastHeartbeat: Date.now(),
                    }));
                },
                onStreamEnd: (summary: StreamSummary) => {
                    resetInactivityTimeout();
                    touchSnapshot(current => ({
                        ...current,
                        summary,
                        lastHeartbeat: Date.now(),
                    }));
                },
                onComplete: (data: StreamCompleteData, files: Record<string, string>) => {
                    completeData = data;
                    resetInactivityTimeout();
                    touchSnapshot(current => ({
                        ...current,
                        phase: 'complete',
                        progressLabel: null,
                        files: data.projectState?.files || files,
                        currentFile: null,
                        lastHeartbeat: Date.now(),
                    }));
                },
                onError: (errorData: StreamErrorData) => {
                    resetInactivityTimeout();
                    const userMessage = getUserFriendlyErrorMessage({
                        errorType: errorData.errorType,
                        errorCode: errorData.errorCode,
                        partialContent: errorData.partialContent,
                        originalMessage: errorData.error,
                        qualityReport: errorData.qualityReport,
                    });

                    touchSnapshot(current => ({
                        ...current,
                        phase: 'error',
                        progressLabel: null,
                        error: userMessage,
                        qualityReport: errorData.qualityReport,
                        lastHeartbeat: Date.now(),
                    }));
                },
                onHeartbeat: () => {
                    resetInactivityTimeout();
                    touchSnapshot(current => ({
                        ...current,
                        lastHeartbeat: Date.now(),
                    }));
                },
            });

            return config.mapResult
                ? config.mapResult(baseResult, completeData)
                : baseResult as TResponse;
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                return {
                    success: false,
                    error: timeoutTriggered ? config.timeoutMessage : config.cancelMessage,
                } as TResponse;
            }

            throw error;
        } finally {
            clearTimeout(inactivityTimeoutId);
            clearTimeout(maxTimeoutId);
        }
    })();

    return {
        controller,
        abort: () => controller.abort(),
        result,
    };
}
