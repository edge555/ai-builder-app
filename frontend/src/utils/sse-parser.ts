import type { GenerateProjectResponse } from '@/shared';

/**
 * Shared SSE parser utility with heartbeat support.
 */
export async function parseSSEStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    handlers: {
        onStart?: () => void;
        onProgress?: (length: number) => void;
        onFile?: (data: any, files: Record<string, string>) => void;
        onComplete?: (data: any, files: Record<string, string>) => void;
        onError?: (error: string) => void;
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
                            handlers.onProgress?.(data.length || 0);
                            break;

                        case 'file':
                            files[data.path] = data.content;
                            handlers.onFile?.(data, files);
                            break;

                        case 'complete':
                            result = {
                                success: true,
                                projectState: data.projectState,
                                version: data.version,
                            };
                            handlers.onComplete?.(data, files);
                            break;

                        case 'error':
                            result = { success: false, error: data.error };
                            handlers.onError?.(data.error);
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
