import type {
    GenerateProjectRequest,
    GenerateProjectResponse,
    ModifyProjectResponse,
    RuntimeError,
    SerializedProjectState,
} from '@ai-app-builder/shared/types';
import { QualityReportSchema } from '@ai-app-builder/shared/schemas';
import { FUNCTIONS_BASE_URL, SUPABASE_ANON_KEY } from '@/integrations/backend/client';
import { createLogger } from '@/utils/logger';

import { config as appConfig } from '../../config';

import { createStreamSession } from './streamingTransport';
import type {
    ModifyProjectOptions,
    ModifyProjectStreamingOptions,
    StreamSession,
    StreamSnapshot,
} from './types';

const generationLogger = createLogger('Generation');

interface CreateGenerationApiServiceOptions {
    onStreamSnapshot?: (snapshot: StreamSnapshot) => void;
    onStreamingChange?: (isStreaming: boolean) => void;
}

export interface GenerationApiService {
    abortCurrentRequest: () => void;
    dispose: () => void;
    generateProject: (description: string, attachments?: GenerateProjectRequest['attachments']) => Promise<GenerateProjectResponse>;
    generateProjectStreaming: (description: string, attachments?: GenerateProjectRequest['attachments']) => Promise<GenerateProjectResponse>;
    modifyProject: (
        currentState: SerializedProjectState,
        prompt: string,
        runtimeError?: RuntimeError,
        options?: ModifyProjectOptions
    ) => Promise<ModifyProjectResponse>;
    modifyProjectStreaming: (
        currentState: SerializedProjectState,
        prompt: string,
        runtimeError?: RuntimeError,
        options?: ModifyProjectStreamingOptions
    ) => Promise<ModifyProjectResponse>;
}

export function createGenerationApiService({
    onStreamSnapshot,
    onStreamingChange,
}: CreateGenerationApiServiceOptions): GenerationApiService {
    let activeRequest: { controller: AbortController; timeoutId: ReturnType<typeof setTimeout> } | null = null;
    let activeStreamSession: StreamSession<GenerateProjectResponse | ModifyProjectResponse> | null = null;

    const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
    };

    const clearActiveRequest = (timeoutId: ReturnType<typeof setTimeout>) => {
        clearTimeout(timeoutId);
        if (activeRequest?.timeoutId === timeoutId) {
            activeRequest = null;
        }
    };

    const logRequestStart = (response: Response, eventName: string) => {
        const requestId = response.headers.get('X-Request-Id');
        if (requestId) {
            generationLogger.info(`${eventName} started`, { requestId });
        }
    };

    const performJsonRequest = async <TResponse>(
        endpoint: string,
        body: Record<string, unknown>,
        eventName: string
    ): Promise<TResponse> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), appConfig.api.timeout);
        activeRequest = { controller, timeoutId };

        try {
            const response = await fetch(`${FUNCTIONS_BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            logRequestStart(response, eventName);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: response.statusText }));
                if (errorData && errorData.success === false && typeof errorData.error === 'string') {
                    // Validate qualityReport shape before propagating — drops malformed data
                    if (errorData.qualityReport != null) {
                        const parsed = QualityReportSchema.safeParse(errorData.qualityReport);
                        errorData.qualityReport = parsed.success ? parsed.data : undefined;
                    }
                    return errorData as TResponse;
                }

                const errorMessage = typeof errorData?.error === 'string'
                    ? errorData.error
                    : errorData?.error?.message || `HTTP ${response.status}`;
                throw new Error(errorMessage);
            }

            return await response.json() as TResponse;
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                const timeoutSeconds = Math.round(appConfig.api.timeout / 1000);
                throw new Error(`Request timed out after ${timeoutSeconds} seconds. Please try again with a simpler request.`);
            }

            throw error;
        } finally {
            clearActiveRequest(timeoutId);
        }
    };

    const runStreamingRequest = async <TResponse extends GenerateProjectResponse | ModifyProjectResponse>(
        session: StreamSession<TResponse>
    ): Promise<TResponse> => {
        activeStreamSession = session;
        onStreamingChange?.(true);

        try {
            return await session.result;
        } finally {
            if (activeStreamSession === session) {
                activeStreamSession = null;
                onStreamingChange?.(false);
            }
        }
    };

    return {
        abortCurrentRequest() {
            if (activeRequest) {
                activeRequest.controller.abort();
                clearTimeout(activeRequest.timeoutId);
                activeRequest = null;
            }

            if (activeStreamSession) {
                activeStreamSession.abort();
                activeStreamSession = null;
                onStreamingChange?.(false);
            }
        },

        dispose() {
            this.abortCurrentRequest();
        },

        generateProject(description, attachments) {
            return performJsonRequest<GenerateProjectResponse>(
                '/generate',
                {
                    description,
                    attachments,
                },
                'generate'
            );
        },

        generateProjectStreaming(description, attachments) {
            if (activeStreamSession) {
                activeStreamSession.abort();
            }

            const session = createStreamSession<GenerateProjectResponse>({
                request: controller => fetch(`${FUNCTIONS_BASE_URL}/generate-stream`, {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({
                        description,
                        attachments,
                    }),
                    signal: controller.signal,
                }),
                onResponse: response => logRequestStart(response, 'generate-stream'),
                onSnapshot: onStreamSnapshot,
                cancelMessage: 'Request was cancelled',
                timeoutMessage: 'Generation timed out or was cancelled',
            });

            return runStreamingRequest(session);
        },

        modifyProject(currentState, prompt, runtimeError, options) {
            return performJsonRequest<ModifyProjectResponse>(
                '/modify',
                {
                    projectState: currentState,
                    prompt,
                    runtimeError,
                    shouldSkipPlanning: options?.shouldSkipPlanning,
                    conversationHistory: options?.conversationHistory,
                    attachments: options?.attachments,
                },
                'modify'
            );
        },

        modifyProjectStreaming(currentState, prompt, runtimeError, options) {
            if (activeStreamSession) {
                activeStreamSession.abort();
            }

            const session = createStreamSession<ModifyProjectResponse>({
                request: controller => fetch(`${FUNCTIONS_BASE_URL}/modify-stream`, {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({
                        projectState: currentState,
                        prompt,
                        runtimeError,
                        shouldSkipPlanning: options?.shouldSkipPlanning,
                        conversationHistory: options?.conversationHistory,
                        errorContext: options?.errorContext,
                        attachments: options?.attachments,
                        ...(typeof options?.repairAttempt === 'number' ? { repairAttempt: options.repairAttempt } : {}),
                    }),
                    signal: controller.signal,
                }),
                onResponse: response => logRequestStart(response, 'modify-stream'),
                onSnapshot: onStreamSnapshot,
                cancelMessage: 'Request was cancelled',
                timeoutMessage: 'Modification timed out or was cancelled',
                mapResult: (baseResult, completeData) => ({
                    ...baseResult,
                    diffs: completeData?.diffs as ModifyProjectResponse['diffs'],
                    changeSummary: completeData?.changeSummary as ModifyProjectResponse['changeSummary'],
                    qualityReport: (completeData?.qualityReport ?? baseResult.qualityReport) as ModifyProjectResponse['qualityReport'],
                    ...(completeData?.partialSuccess ? { partialSuccess: completeData.partialSuccess as boolean } : {}),
                    ...(Array.isArray(completeData?.rolledBackFiles) && completeData.rolledBackFiles.length > 0
                        ? { rolledBackFiles: completeData.rolledBackFiles as string[] }
                        : {}),
                }),
            });

            return runStreamingRequest(session);
        },
    };
}
