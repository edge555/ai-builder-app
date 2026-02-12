import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { LoadingPhase } from '../components/ChatInterface';
import type { RuntimeError, GenerateProjectResponse, ModifyProjectResponse, SerializedProjectState } from '@/shared';
import { config as appConfig } from '../config';
import { FUNCTIONS_BASE_URL, SUPABASE_ANON_KEY } from '@/integrations/backend/client';
import { parseSSEStream } from '@/utils/sse-parser';
import { buildRepairPrompt } from '@/utils/repair-prompt';
import { GenerationContext, type GenerationContextValue, type StreamingState } from './GenerationContext.context';
import { useErrorAggregator } from './ErrorAggregatorContext';

const MAX_AUTO_REPAIR_ATTEMPTS = 3;
const STREAMING_TIMEOUT_MS = 120000; // 120 seconds

/**
 * Provider for generation and modification operations.
 * Manages loading states, streaming, and auto-repair.
 */
export function GenerationProvider({ children }: { children: React.ReactNode }) {
  const errorAggregator = useErrorAggregator();
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
      const response = await fetch(`${FUNCTIONS_BASE_URL}/generate`, {
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
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return await response.json() as GenerateProjectResponse;
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
      const response = await fetch(`${FUNCTIONS_BASE_URL}/modify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ projectState: currentState, prompt, runtimeError }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return await response.json() as ModifyProjectResponse;
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
    const repairPrompt = buildRepairPrompt(runtimeError, fileContext, errorAggregator);

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
  }, [isAutoRepairing, modifyProject, errorAggregator]);

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
