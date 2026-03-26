import type { GenerateProjectResponse } from '@ai-app-builder/shared/types';

/**
 * Shared SSE parser utility with heartbeat support.
 */
export interface StreamErrorData {
    error: string;
    errorCode?: string;
    errorType?: 'timeout' | 'rate_limit' | 'api_error' | 'cancelled' | 'unknown';
    partialContent?: string;
}

export interface StreamWarningData {
    path: string;
    message: string;
    type: 'formatting' | 'validation';
}

export interface StreamFileData {
    path: string;
    content: string;
    index: number;
    total: number;
}

export interface StreamCompleteData {
    projectState?: { files: Record<string, string>;[key: string]: unknown };
    version?: unknown;
    [key: string]: unknown;
}

export interface StreamEndData {
    totalFiles: number;
    successfulFiles: number;
    failedFiles: number;
    warnings: number;
}

export interface StreamProgressData {
    phase?: string;
    label?: string;
    length?: number;
    isDegraded?: boolean;
}

export async function parseSSEStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    handlers: {
        onStart?: () => void;
        onProgress?: (data: StreamProgressData) => void;
        onFile?: (data: StreamFileData, files: Record<string, string>) => void;
        onWarning?: (warning: StreamWarningData) => void;
        onStreamEnd?: (summary: StreamEndData) => void;
        onComplete?: (data: StreamCompleteData, files: Record<string, string>) => void;
        onError?: (errorData: StreamErrorData) => void;
        onHeartbeat?: () => void;
    }
): Promise<GenerateProjectResponse> {
    const decoder = new TextDecoder();
    let buffer = '';
    let result: GenerateProjectResponse = { success: false };
    const files: Record<string, string> = {};

    // Persist across chunks so split events are properly handled
    let currentEvent = '';
    let currentData = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        // Keep the last line in buffer if it doesn't end with newline (incomplete)
        buffer = lines.pop() || '';

        for (const line of lines) {
            // Handle heartbeat comments
            if (line.startsWith(':')) {
                handlers.onHeartbeat?.();
                continue;
            }

            if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
                currentData = line.slice(6).trim();
            } else if (line === '' && currentEvent && currentData) {
                try {
                    const data = JSON.parse(currentData);

                    switch (currentEvent) {
                        case 'start':
                            handlers.onStart?.();
                            break;

                        case 'progress':
                            handlers.onProgress?.({
                                phase: data.phase,
                                label: data.label,
                                length: data.length,
                            });
                            break;

                        case 'file':
                            files[data.path] = data.content;
                            handlers.onFile?.(data, files);
                            break;

                        case 'warning':
                            const warningData: StreamWarningData = {
                                path: data.path,
                                message: data.message,
                                type: data.type,
                            };
                            handlers.onWarning?.(warningData);
                            break;

                        case 'stream-end':
                            const streamEndData: StreamEndData = {
                                totalFiles: data.totalFiles,
                                successfulFiles: data.successfulFiles,
                                failedFiles: data.failedFiles,
                                warnings: data.warnings,
                            };
                            handlers.onStreamEnd?.(streamEndData);
                            break;

                        case 'complete':
                            result = {
                                success: true,
                                projectState: data.projectState,
                                version: data.version,
                            };
                            handlers.onComplete?.(data, files);
                            break;

                        case 'pipeline-stage':
                            // Map pipeline stage events to progress updates
                            if (data.status === 'start' && data.label) {
                                handlers.onProgress?.({
                                    phase: data.stage,
                                    label: data.label,
                                });
                            } else if (data.status === 'degraded' && data.label) {
                                handlers.onProgress?.({
                                    phase: data.stage,
                                    label: data.label,
                                    isDegraded: true,
                                });
                            }
                            break;

                        case 'phase-start':
                            handlers.onProgress?.({
                                phase: data.phase,
                                label: `Generating ${data.phase} (phase ${data.phaseIndex + 1}/${data.totalPhases}, ${data.filesInPhase} files)…`,
                            });
                            break;

                        case 'phase-complete':
                            handlers.onProgress?.({
                                phase: data.phase,
                                label: `${data.phase} complete (${data.totalGenerated}/${data.totalPlanned} files generated)`,
                            });
                            break;

                        case 'error':
                            const errorData: StreamErrorData = {
                                error: data.error,
                                errorCode: data.errorCode,
                                errorType: data.errorType,
                                partialContent: data.partialContent,
                            };
                            result = { success: false, error: data.error };
                            handlers.onError?.(errorData);
                            break;
                    }
                } catch {
                    // Skip invalid JSON
                }
                currentEvent = '';
                currentData = '';
            }
            // Unrecognized lines are ignored (they're typically partial lines kept in buffer)
        }
    }

    return result;
}
