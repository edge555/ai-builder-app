import { useState, useCallback, useRef } from 'react';
import type { SerializedProjectState, SerializedVersion } from '@/shared';
import { FUNCTIONS_BASE_URL, SUPABASE_ANON_KEY } from '@/integrations/backend/client';

export type StreamingPhase = 'idle' | 'connecting' | 'generating' | 'processing' | 'complete' | 'error';

export interface StreamingFile {
  path: string;
  content: string;
  index: number;
  total: number;
}

export interface StreamingState {
  phase: StreamingPhase;
  files: Record<string, string>;
  currentFile: string | null;
  filesReceived: number;
  totalFiles: number;
  textLength: number;
  error: string | null;
}

export interface StreamingResult {
  success: boolean;
  projectState?: SerializedProjectState;
  version?: SerializedVersion;
  error?: string;
}

export interface UseStreamingGenerationReturn {
  state: StreamingState;
  generate: (description: string) => Promise<StreamingResult>;
  cancel: () => void;
  reset: () => void;
}

const initialState: StreamingState = {
  phase: 'idle',
  files: {},
  currentFile: null,
  filesReceived: 0,
  totalFiles: 0,
  textLength: 0,
  error: null,
};

/**
 * Hook for streaming project generation with real-time updates.
 */
export function useStreamingGeneration(): UseStreamingGenerationReturn {
  const [state, setState] = useState<StreamingState>(initialState);
  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setState(prev => ({ ...prev, phase: 'idle', error: 'Generation cancelled' }));
  }, []);

  const generate = useCallback(async (description: string): Promise<StreamingResult> => {
    // Cancel any existing request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState({
      ...initialState,
      phase: 'connecting',
    });

    try {
      const response = await fetch(`${FUNCTIONS_BASE_URL}/generate-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ description }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let result: StreamingResult = { success: false };
      const files: Record<string, string> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Parse SSE events
        const lines = buffer.split('\n');
        buffer = '';

        let currentEvent = '';
        let currentData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6).trim();
          } else if (line === '' && currentEvent && currentData) {
            // Process complete event
            try {
              const data = JSON.parse(currentData);
              
              switch (currentEvent) {
                case 'start':
                  setState(prev => ({ ...prev, phase: 'generating' }));
                  break;
                  
                case 'progress':
                  setState(prev => ({
                    ...prev,
                    textLength: data.length || 0,
                  }));
                  break;
                  
                case 'file':
                  files[data.path] = data.content;
                  setState(prev => ({
                    ...prev,
                    phase: 'processing',
                    files: { ...files },
                    currentFile: data.path,
                    filesReceived: data.index + 1,
                    totalFiles: data.total,
                  }));
                  break;
                  
                case 'complete':
                  result = {
                    success: true,
                    projectState: data.projectState,
                    version: data.version,
                  };
                  setState(prev => ({
                    ...prev,
                    phase: 'complete',
                    files: data.projectState?.files || files,
                    currentFile: null,
                  }));
                  break;
                  
                case 'error':
                  result = { success: false, error: data.error };
                  setState(prev => ({
                    ...prev,
                    phase: 'error',
                    error: data.error,
                  }));
                  break;
              }
            } catch {
              // Skip invalid JSON
            }
            currentEvent = '';
            currentData = '';
          } else if (line !== '') {
            // Incomplete line, add back to buffer
            buffer += line + '\n';
          }
        }
      }

      return result;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return { success: false, error: 'Generation cancelled' };
      }
      
      const error = e instanceof Error ? e.message : 'Unknown error';
      setState(prev => ({
        ...prev,
        phase: 'error',
        error,
      }));
      return { success: false, error };
    }
  }, []);

  return {
    state,
    generate,
    cancel,
    reset,
  };
}
