import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { LoadingPhase } from '../components/ChatInterface';
import type { RuntimeError, GenerateProjectResponse, ModifyProjectResponse, SerializedProjectState } from '@/shared';
import { config as appConfig } from '../config';
import { backend, FUNCTIONS_BASE_URL, SUPABASE_ANON_KEY } from '@/integrations/backend/client';
import { errorAggregator } from '@/services/ErrorAggregator';

const MAX_AUTO_REPAIR_ATTEMPTS = 3;
const STREAMING_TIMEOUT_MS = 120000; // 120 seconds

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

const GenerationContext = createContext<GenerationContextValue | null>(null);

/**
 * Provider for generation and modification operations.
 * Manages loading states, streaming, and auto-repair.
 */
export function GenerationProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isAutoRepairing, setIsAutoRepairing] = useState(false);
  const [autoRepairAttempt, setAutoRepairAttempt] = useState(0);
  const [streamingState, setStreamingState] = useState<StreamingState | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const activeRequestRef = useRef<{ controller: AbortController; timeoutId: ReturnType<typeof setTimeout> } | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const lastRepairErrorRef = useRef<string | null>(null);
  const autoRepairAttemptRef = useRef(0);

  // Keep ref in sync with state
  useEffect(() => {
    autoRepairAttemptRef.current = autoRepairAttempt;
  }, [autoRepairAttempt]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const activeRequest = activeRequestRef.current;
      if (activeRequest) {
        activeRequest.controller.abort();
        clearTimeout(activeRequest.timeoutId);
        activeRequestRef.current = null;
      }
      streamAbortRef.current?.abort();
    };
  }, []);

  /**
   * Clears the current error.
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Resets auto-repair state.
   */
  const resetAutoRepair = useCallback(() => {
    setAutoRepairAttempt(0);
    setIsAutoRepairing(false);
    lastRepairErrorRef.current = null;
  }, []);

  /**
   * Calls the streaming generate project API with timeout.
   */
  const generateProjectStreaming = useCallback(async (description: string): Promise<GenerateProjectResponse> => {
    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;

    // Set timeout for streaming
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, STREAMING_TIMEOUT_MS);

    setIsStreaming(true);
    setStreamingState({
      phase: 'connecting',
      files: {},
      currentFile: null,
      filesReceived: 0,
      totalFiles: 0,
      textLength: 0,
      error: null,
      lastHeartbeat: Date.now(),
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

      const result = await parseSSEStream(reader, {
        onStart: () => {
          setStreamingState(prev => prev ? { ...prev, phase: 'generating', lastHeartbeat: Date.now() } : null);
        },
        onProgress: (length: number) => {
          setStreamingState(prev => prev ? { ...prev, textLength: length, lastHeartbeat: Date.now() } : null);
        },
        onFile: (data: { path: string; content: string; index: number; total: number }, files: Record<string, string>) => {
          setStreamingState(prev => prev ? {
            ...prev,
            phase: 'processing',
            files: { ...files },
            currentFile: data.path,
            filesReceived: data.index + 1,
            totalFiles: data.total,
            lastHeartbeat: Date.now(),
          } : null);
        },
        onComplete: (data: any, files: Record<string, string>) => {
          setStreamingState(prev => prev ? {
            ...prev,
            phase: 'complete',
            files: data.projectState?.files || files,
            currentFile: null,
            lastHeartbeat: Date.now(),
          } : null);
        },
        onError: (errorMsg: string) => {
          setStreamingState(prev => prev ? { ...prev, phase: 'error', error: errorMsg, lastHeartbeat: Date.now() } : null);
        },
        onHeartbeat: () => {
          setStreamingState(prev => prev ? { ...prev, lastHeartbeat: Date.now() } : null);
        },
      });

      clearTimeout(timeoutId);
      return result;
    } catch (e) {
      clearTimeout(timeoutId);
      if (e instanceof Error && e.name === 'AbortError') {
        return { success: false, error: 'Generation timed out or was cancelled' };
      }
      throw e;
    } finally {
      setIsStreaming(false);
      streamAbortRef.current = null;
    }
  }, []);

  /**
   * Calls the generate project API with configurable timeout (non-streaming fallback).
   */
  const generateProject = useCallback(async (description: string): Promise<GenerateProjectResponse> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), appConfig.api.timeout);
    activeRequestRef.current = { controller, timeoutId };

    try {
      const { data, error } = await backend.functions.invoke('generate', {
        body: { description },
      });
      if (error) throw new Error(error.message);
      return data as GenerateProjectResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timed out after 60 seconds. Please try again with a simpler request.');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      if (activeRequestRef.current?.timeoutId === timeoutId) {
        activeRequestRef.current = null;
      }
    }
  }, []);

  /**
   * Calls the modify project API with configurable timeout.
   */
  const modifyProject = useCallback(async (
    currentState: SerializedProjectState,
    prompt: string,
    runtimeError?: RuntimeError
  ): Promise<ModifyProjectResponse> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), appConfig.api.timeout);
    activeRequestRef.current = { controller, timeoutId };

    try {
      const { data, error } = await backend.functions.invoke('modify', {
        body: { projectState: currentState, prompt, runtimeError },
      });
      if (error) throw new Error(error.message);
      return data as ModifyProjectResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timed out after 60 seconds. Please try again with a simpler request.');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      if (activeRequestRef.current?.timeoutId === timeoutId) {
        activeRequestRef.current = null;
      }
    }
  }, []);

  /**
   * Triggers auto-repair for a runtime error.
   * Returns true if repair was successful.
   */
  const autoRepair = useCallback(async (runtimeError: RuntimeError, projectState: SerializedProjectState | null): Promise<boolean> => {
    // Prevent duplicate repairs for the same error
    const errorKey = `${runtimeError.message}:${runtimeError.filePath}`;
    if (lastRepairErrorRef.current === errorKey) {
      return false;
    }

    // Check if we've exceeded max attempts (use ref to avoid stale closure)
    if (autoRepairAttemptRef.current >= MAX_AUTO_REPAIR_ATTEMPTS) {
      return false;
    }

    // Need a project to repair
    if (!projectState) {
      return false;
    }

    // Already repairing
    if (isAutoRepairing) {
      return false;
    }

    lastRepairErrorRef.current = errorKey;
    setIsAutoRepairing(true);
    setAutoRepairAttempt(prev => prev + 1);
    setLoadingPhase('modifying');

    // Get file context for better repair prompts
    const fileContext = projectState.files;
    const repairPrompt = buildRepairPrompt(runtimeError, fileContext);

    try {
      const result = await modifyProject(projectState, repairPrompt, runtimeError);

      setIsAutoRepairing(false);
      setLoadingPhase('idle');

      if (result.success && result.projectState) {
        return true;
      } else {
        console.error('[AutoRepair] Repair failed:', result.error);
        return false;
      }
    } catch (err) {
      console.error('[AutoRepair] Repair threw error:', err);
      setIsAutoRepairing(false);
      setLoadingPhase('idle');
      return false;
    }
  }, [isAutoRepairing, modifyProject]);

  const value = useMemo<GenerationContextValue>(() => ({
    isLoading,
    loadingPhase,
    error,
    isAutoRepairing,
    autoRepairAttempt,
    streamingState,
    isStreaming,
    generateProject,
    generateProjectStreaming,
    modifyProject,
    autoRepair,
    resetAutoRepair,
    setIsLoading,
    setLoadingPhase,
    clearError,
  }), [
    isLoading,
    loadingPhase,
    error,
    isAutoRepairing,
    autoRepairAttempt,
    streamingState,
    isStreaming,
    generateProject,
    generateProjectStreaming,
    modifyProject,
    autoRepair,
    resetAutoRepair,
    clearError,
  ]);

  return (
    <GenerationContext.Provider value={value}>
      {children}
    </GenerationContext.Provider>
  );
}

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

/**
 * Shared SSE parser utility with heartbeat support.
 */
async function parseSSEStream(
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

/**
 * Builds a repair prompt for a runtime error or aggregated errors.
 */
function buildRepairPrompt(runtimeError: RuntimeError, projectFiles?: Record<string, string>): string {
  // Check if we have aggregated errors
  const aggregatedReport = errorAggregator.buildErrorReport(projectFiles);

  if (aggregatedReport) {
    return aggregatedReport;
  }

  // Fallback to single error prompt
  const parts = [
    `Fix the following runtime error that crashed the application preview:`,
    ``,
    `Error Type: ${runtimeError.type}`,
    `Error Message: ${runtimeError.message}`,
  ];

  if (runtimeError.filePath) {
    parts.push(`File: ${runtimeError.filePath}`);
  }
  if (runtimeError.line) {
    parts.push(`Line: ${runtimeError.line}`);
  }
  if (runtimeError.componentStack) {
    parts.push(``, `Component Stack:`, runtimeError.componentStack.slice(0, 500));
  }
  if (runtimeError.stack) {
    parts.push(``, `Stack Trace:`, runtimeError.stack.slice(0, 800));
  }

  // Add suggested fixes from the error
  if (runtimeError.suggestedFixes && runtimeError.suggestedFixes.length > 0) {
    parts.push(``, `Suggested fixes:`);
    runtimeError.suggestedFixes.forEach(fix => {
      parts.push(`- ${fix}`);
    });
  } else {
    parts.push(
      ``,
      `Common fixes for ${runtimeError.type}:`,
      ...getRepairHints(runtimeError.type)
    );
  }

  parts.push(
    ``,
    `IMPORTANT: Apply the minimal fix needed to resolve this error.`,
    `Ensure the project compiles and runs after the fix.`
  );

  return parts.join('\n');
}

/**
 * Returns repair hints based on error type.
 */
function getRepairHints(errorType: RuntimeError['type']): string[] {
  switch (errorType) {
    case 'BUILD_ERROR':
      return [
        '- Check for syntax errors in the affected file',
        '- Verify all imports are correct',
        '- Ensure TypeScript/JSX syntax is valid',
      ];
    case 'IMPORT_ERROR':
      return [
        '- Check if the module path is correct',
        '- Use an already installed alternative (lucide-react instead of react-icons)',
        '- Remove the import if not essential',
      ];
    case 'UNDEFINED_EXPORT':
      return [
        '- Verify the export name matches what the module provides',
        '- Check for typos in the import name',
        '- Use default import if named export does not exist',
      ];
    case 'REFERENCE_ERROR':
      return [
        '- Check if the variable is defined before use',
        '- Add missing imports',
        '- Fix typos in variable names',
      ];
    case 'TYPE_ERROR':
      return [
        '- Add null/undefined checks before accessing properties',
        '- Provide default values for optional properties',
        '- Ensure functions are called correctly',
      ];
    case 'RENDER_ERROR':
      return [
        '- Check component props and state initialization',
        '- Ensure hooks are called unconditionally',
        '- Verify JSX structure is valid',
      ];
    case 'SYNTAX_ERROR':
      return [
        '- Fix bracket matching',
        '- Close unclosed strings',
        '- Check for missing semicolons or commas',
      ];
    case 'CSS_ERROR':
      return [
        '- Fix CSS syntax (semicolons, brackets)',
        '- Verify property names are valid',
        '- Check for unclosed rules',
      ];
    default:
      return [
        '- Check for undefined values',
        '- Verify imports are correct',
        '- Ensure proper error handling',
      ];
  }
}
