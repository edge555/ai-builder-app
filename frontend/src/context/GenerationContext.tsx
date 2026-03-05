import type { RuntimeError, GenerateProjectResponse, ModifyProjectResponse, SerializedProjectState, RepairAttempt } from '@ai-app-builder/shared/types';
import type { AggregatedErrors } from '@/services/ErrorAggregator';
import { useState, useCallback, useMemo, useRef, useEffect, type ReactNode } from 'react';

import { FUNCTIONS_BASE_URL, SUPABASE_ANON_KEY } from '@/integrations/backend/client';
import { getUserFriendlyErrorMessage } from '@/utils/error-messages';
import { createLogger } from '@/utils/logger';
import { buildRepairPrompt } from '@/utils/repair-prompt';
import { parseSSEStream, type StreamFileData, type StreamCompleteData, type StreamProgressData } from '@/utils/sse-parser';

import { type LoadingPhase } from '../components/ChatInterface/LoadingIndicator';
import { config as appConfig } from '../config';


import { useErrorAggregator } from './ErrorAggregatorContext';
import {
  GenerationContext,
  GenerationStateContext,
  GenerationActionsContext,
  type GenerationContextValue,
  type GenerationStateValue,
  type GenerationActionsValue,
  type StreamingState
} from './GenerationContext.context';


const genLogger = createLogger('Generation');

const MAX_AUTO_REPAIR_ATTEMPTS = 3;
const STREAMING_INACTIVITY_TIMEOUT_MS = 120_000; // 120s of silence = dead connection
const STREAMING_MAX_TIMEOUT_MS = 900_000; // 15 min absolute cap (safety net)

/**
 * Provider for generation and modification operations.
 * Manages loading states, streaming, and auto-repair.
 */
export function GenerationProvider({ children }: { children: ReactNode }) {
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
  const repairHistoryRef = useRef<RepairAttempt[]>([]);

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
   * Aborts the current in-flight request.
   */
  const abortCurrentRequest = useCallback(() => {
    const activeRequest = activeRequestRef.current;
    if (activeRequest) {
      activeRequest.controller.abort();
      clearTimeout(activeRequest.timeoutId);
      activeRequestRef.current = null;
    }
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
  }, []);

  /**
   * Resets auto-repair state.
   */
  const resetAutoRepair = useCallback(() => {
    setAutoRepairAttempt(0);
    setIsAutoRepairing(false);
    lastRepairErrorRef.current = null;
    repairHistoryRef.current = [];
  }, []);

  /**
   * Calls the streaming generate project API with timeout.
   */
  const generateProjectStreaming = useCallback(async (description: string): Promise<GenerateProjectResponse> => {
    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;

    // Absolute max timeout — fires regardless of activity
    const maxTimeoutId = setTimeout(() => {
      controller.abort();
    }, STREAMING_MAX_TIMEOUT_MS);

    // Inactivity timeout — reset on every SSE event (heartbeat, progress, file, etc.)
    // If the server goes completely silent for 120s, abort the connection
    let inactivityTimeoutId: ReturnType<typeof setTimeout>;
    const resetInactivityTimeout = () => {
      clearTimeout(inactivityTimeoutId);
      inactivityTimeoutId = setTimeout(() => {
        controller.abort();
      }, STREAMING_INACTIVITY_TIMEOUT_MS);
    };
    resetInactivityTimeout();

    setIsStreaming(true);
    setStreamingState({
      phase: 'connecting',
      progressLabel: null,
      files: {},
      currentFile: null,
      filesReceived: 0,
      totalFiles: 0,
      textLength: 0,
      error: null,
      lastHeartbeat: Date.now(),
      warnings: [],
      summary: null,
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
          resetInactivityTimeout();
          setStreamingState(prev => prev ? { ...prev, phase: 'generating', lastHeartbeat: Date.now() } : null);
        },
        onProgress: (progressData: StreamProgressData) => {
          resetInactivityTimeout();
          setStreamingState(prev => prev ? {
            ...prev,
            textLength: progressData.length ?? prev.textLength,
            progressLabel: progressData.label ?? prev.progressLabel,
            lastHeartbeat: Date.now(),
          } : null);
        },
        onFile: (data: StreamFileData, files: Record<string, string>) => {
          resetInactivityTimeout();
          setStreamingState(prev => prev ? {
            ...prev,
            phase: 'processing',
            progressLabel: null,
            files: { ...files },
            currentFile: data.path,
            filesReceived: data.index + 1,
            totalFiles: data.total,
            lastHeartbeat: Date.now(),
          } : null);
        },
        onWarning: (warning) => {
          resetInactivityTimeout();
          setStreamingState(prev => prev ? {
            ...prev,
            warnings: [...prev.warnings, warning],
            lastHeartbeat: Date.now(),
          } : null);
        },
        onStreamEnd: (summary) => {
          resetInactivityTimeout();
          setStreamingState(prev => prev ? {
            ...prev,
            summary,
            lastHeartbeat: Date.now(),
          } : null);
        },
        onComplete: (data: StreamCompleteData, files: Record<string, string>) => {
          resetInactivityTimeout();
          setStreamingState(prev => prev ? {
            ...prev,
            phase: 'complete',
            progressLabel: null,
            files: data.projectState?.files || files,
            currentFile: null,
            lastHeartbeat: Date.now(),
          } : null);
        },
        onError: (errorData) => {
          resetInactivityTimeout();
          // Create user-friendly error message based on error type
          const userMessage = getUserFriendlyErrorMessage({
            errorType: errorData.errorType,
            errorCode: errorData.errorCode,
            partialContent: errorData.partialContent,
            originalMessage: errorData.error,
          });

          setStreamingState(prev => prev ? {
            ...prev,
            phase: 'error',
            progressLabel: null,
            error: userMessage,
            lastHeartbeat: Date.now(),
          } : null);
        },
        onHeartbeat: () => {
          resetInactivityTimeout();
          setStreamingState(prev => prev ? { ...prev, lastHeartbeat: Date.now() } : null);
        },
      });

      clearTimeout(inactivityTimeoutId);
      clearTimeout(maxTimeoutId);
      return result;
    } catch (e) {
      clearTimeout(inactivityTimeoutId);
      clearTimeout(maxTimeoutId);
      if (e instanceof Error && e.name === 'AbortError') {
        // Check if it was user-initiated abort
        if (controller.signal.aborted) {
          // User cancelled - return partial results if available
          return {
            success: false,
            error: 'Request was cancelled',
            // Don't throw - let caller handle gracefully
          };
        }
        // Timeout
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
        const timeoutSeconds = Math.round(appConfig.api.timeout / 1000);
        throw new Error(`Request timed out after ${timeoutSeconds} seconds. Please try again with a simpler request.`);
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
    runtimeError?: RuntimeError,
    options?: { shouldSkipPlanning?: boolean }
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
        body: JSON.stringify({ projectState: currentState, prompt, runtimeError, shouldSkipPlanning: options?.shouldSkipPlanning }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return await response.json() as ModifyProjectResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutSeconds = Math.round(appConfig.api.timeout / 1000);
        throw new Error(`Request timed out after ${timeoutSeconds} seconds. Please try again with a simpler request.`);
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
   * Calls the streaming modify project API via SSE.
   * Mirrors generateProjectStreaming but POSTs to /modify-stream.
   */
  const modifyProjectStreaming = useCallback(async (
    currentState: SerializedProjectState,
    prompt: string,
    runtimeError?: RuntimeError,
    options?: { shouldSkipPlanning?: boolean }
  ): Promise<ModifyProjectResponse> => {
    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;

    const maxTimeoutId = setTimeout(() => {
      controller.abort();
    }, STREAMING_MAX_TIMEOUT_MS);

    let inactivityTimeoutId: ReturnType<typeof setTimeout>;
    const resetInactivityTimeout = () => {
      clearTimeout(inactivityTimeoutId);
      inactivityTimeoutId = setTimeout(() => {
        controller.abort();
      }, STREAMING_INACTIVITY_TIMEOUT_MS);
    };
    resetInactivityTimeout();

    setIsStreaming(true);
    setStreamingState({
      phase: 'connecting',
      progressLabel: null,
      files: {},
      currentFile: null,
      filesReceived: 0,
      totalFiles: 0,
      textLength: 0,
      error: null,
      lastHeartbeat: Date.now(),
      warnings: [],
      summary: null,
    });

    // Capture modify-specific fields from the complete event
    let modifyDiffs: ModifyProjectResponse['diffs'];
    let modifyChangeSummary: ModifyProjectResponse['changeSummary'];

    try {
      const response = await fetch(`${FUNCTIONS_BASE_URL}/modify-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          projectState: currentState,
          prompt,
          runtimeError,
          shouldSkipPlanning: options?.shouldSkipPlanning,
        }),
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
          resetInactivityTimeout();
          setStreamingState(prev => prev ? { ...prev, phase: 'generating', lastHeartbeat: Date.now() } : null);
        },
        onProgress: (progressData: StreamProgressData) => {
          resetInactivityTimeout();
          setStreamingState(prev => prev ? {
            ...prev,
            textLength: progressData.length ?? prev.textLength,
            progressLabel: progressData.label ?? prev.progressLabel,
            lastHeartbeat: Date.now(),
          } : null);
        },
        onFile: (data: StreamFileData, files: Record<string, string>) => {
          resetInactivityTimeout();
          setStreamingState(prev => prev ? {
            ...prev,
            phase: 'processing',
            progressLabel: null,
            files: { ...files },
            currentFile: data.path,
            filesReceived: data.index + 1,
            totalFiles: data.total,
            lastHeartbeat: Date.now(),
          } : null);
        },
        onWarning: (warning) => {
          resetInactivityTimeout();
          setStreamingState(prev => prev ? {
            ...prev,
            warnings: [...prev.warnings, warning],
            lastHeartbeat: Date.now(),
          } : null);
        },
        onStreamEnd: (summary) => {
          resetInactivityTimeout();
          setStreamingState(prev => prev ? {
            ...prev,
            summary,
            lastHeartbeat: Date.now(),
          } : null);
        },
        onComplete: (data: StreamCompleteData, files: Record<string, string>) => {
          resetInactivityTimeout();
          // Capture diffs and changeSummary from the modify-stream complete payload
          modifyDiffs = (data as any).diffs;
          modifyChangeSummary = (data as any).changeSummary;
          setStreamingState(prev => prev ? {
            ...prev,
            phase: 'complete',
            progressLabel: null,
            files: data.projectState?.files || files,
            currentFile: null,
            lastHeartbeat: Date.now(),
          } : null);
        },
        onError: (errorData) => {
          resetInactivityTimeout();
          const userMessage = getUserFriendlyErrorMessage({
            errorType: errorData.errorType,
            errorCode: errorData.errorCode,
            partialContent: errorData.partialContent,
            originalMessage: errorData.error,
          });
          setStreamingState(prev => prev ? {
            ...prev,
            phase: 'error',
            progressLabel: null,
            error: userMessage,
            lastHeartbeat: Date.now(),
          } : null);
        },
        onHeartbeat: () => {
          resetInactivityTimeout();
          setStreamingState(prev => prev ? { ...prev, lastHeartbeat: Date.now() } : null);
        },
      });

      clearTimeout(inactivityTimeoutId);
      clearTimeout(maxTimeoutId);

      // Merge modify-specific fields into the result
      return {
        ...result,
        diffs: modifyDiffs,
        changeSummary: modifyChangeSummary,
      } as ModifyProjectResponse;
    } catch (e) {
      clearTimeout(inactivityTimeoutId);
      clearTimeout(maxTimeoutId);
      if (e instanceof Error && e.name === 'AbortError') {
        if (controller.signal.aborted) {
          return { success: false, error: 'Request was cancelled' };
        }
        return { success: false, error: 'Modification timed out or was cancelled' };
      }
      throw e;
    } finally {
      setIsStreaming(false);
      streamAbortRef.current = null;
    }
  }, []);

  /**
   * Triggers auto-repair for a runtime error.
   * Returns true if repair was successful.
   * Accumulates failure history across attempts to help AI avoid repeating mistakes.
   */
  const autoRepair = useCallback(async (runtimeError: RuntimeError, projectState: SerializedProjectState | null, aggregatedErrors?: AggregatedErrors | null): Promise<boolean> => {
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

    // Build repair prompt with failure history from previous attempts
    const repairPrompt = buildRepairPrompt(
      runtimeError,
      fileContext,
      errorAggregator,
      repairHistoryRef.current.length > 0 ? repairHistoryRef.current : undefined
    );

    try {
      const result = await modifyProjectStreaming(projectState, repairPrompt, runtimeError, { shouldSkipPlanning: true });

      setIsAutoRepairing(false);
      setLoadingPhase('idle');

      if (result.success && result.projectState) {
        // Success - clear history for next error
        repairHistoryRef.current = [];
        return true;
      } else {
        genLogger.error('Repair failed', { error: result.error });

        // Record this failure in history
        repairHistoryRef.current.push({
          attempt: autoRepairAttemptRef.current,
          error: result.error || 'Repair modification failed',
          strategy: `Attempted to fix ${runtimeError.type}: ${runtimeError.message}`,
          timestamp: new Date().toISOString(),
        });

        return false;
      }
    } catch (error) {
      genLogger.error('Repair threw error', { error });

      // Record this failure in history
      repairHistoryRef.current.push({
        attempt: autoRepairAttemptRef.current,
        error: error instanceof Error ? error.message : 'Unknown error',
        strategy: `Attempted to fix ${runtimeError.type}: ${runtimeError.message}`,
        timestamp: new Date().toISOString(),
      });

      setIsAutoRepairing(false);
      setLoadingPhase('idle');
      return false;
    }
  }, [isAutoRepairing, modifyProjectStreaming, errorAggregator]);

  // Split context into state and actions to reduce re-renders
  const stateValue = useMemo<GenerationStateValue>(() => ({
    isLoading,
    loadingPhase,
    error,
    isAutoRepairing,
    autoRepairAttempt,
    streamingState,
    isStreaming,
  }), [
    isLoading,
    loadingPhase,
    error,
    isAutoRepairing,
    autoRepairAttempt,
    streamingState,
    isStreaming,
  ]);

  // Actions are stable (all callbacks wrapped in useCallback)
  // This value rarely changes, preventing re-renders in action-only consumers
  const actionsValue = useMemo<GenerationActionsValue>(() => ({
    generateProject,
    generateProjectStreaming,
    modifyProject,
    modifyProjectStreaming,
    autoRepair,
    resetAutoRepair,
    setIsLoading,
    setLoadingPhase,
    clearError,
    abortCurrentRequest,
  }), [
    generateProject,
    generateProjectStreaming,
    modifyProject,
    modifyProjectStreaming,
    autoRepair,
    resetAutoRepair,
    clearError,
    abortCurrentRequest,
  ]);

  // Combined value for backward compatibility
  const value = useMemo<GenerationContextValue>(() => ({
    ...stateValue,
    ...actionsValue,
  }), [stateValue, actionsValue]);

  return (
    <GenerationStateContext.Provider value={stateValue}>
      <GenerationActionsContext.Provider value={actionsValue}>
        <GenerationContext.Provider value={value}>
          {children}
        </GenerationContext.Provider>
      </GenerationActionsContext.Provider>
    </GenerationStateContext.Provider>
  );
}
