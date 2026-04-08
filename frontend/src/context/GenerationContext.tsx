import type { RuntimeError, GenerateProjectResponse, ModifyProjectResponse, SerializedProjectState, ImageAttachment } from '@ai-app-builder/shared/types';
import type { AggregatedErrors } from '@/services/ErrorAggregator';
import { useState, useCallback, useMemo, useRef, useEffect, type ReactNode } from 'react';

import { createLogger } from '@/utils/logger';

import { type LoadingPhase } from '../components/ChatInterface/LoadingIndicator';
import { createGenerationApiService } from './generation/generationApiService';
import { createRepairService } from './generation/repairService';
import { useErrorAggregator } from './ErrorAggregatorContext';
import { useWorkspace } from './WorkspaceContext';
import {
  GenerationStateContext,
  GenerationActionsContext,
  type GenerationStateValue,
  type GenerationActionsValue,
} from './GenerationContext.context';

const genLogger = createLogger('Generation');

/**
 * Provider for generation and modification operations.
 * Keeps React ownership limited to UI state while services own transport and request logic.
 */
export function GenerationProvider({ children }: { children: ReactNode }) {
  const errorAggregator = useErrorAggregator();
  const { workspaceId, projectId: workspaceProjectId } = useWorkspace();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isAutoRepairing, setIsAutoRepairing] = useState(false);
  const [autoRepairAttempt, setAutoRepairAttempt] = useState(0);
  const [streamingState, setStreamingState] = useState<GenerationStateValue['streamingState']>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const isAutoRepairingRef = useRef(false);

  const generationApiService = useMemo(() => createGenerationApiService({
    requestContext: {
      workspaceId,
      projectId: workspaceProjectId,
    },
    onStreamSnapshot: setStreamingState,
    onStreamingChange: setIsStreaming,
  }), [workspaceId, workspaceProjectId]);

  const repairService = useMemo(() => createRepairService({
    errorAggregator,
    executeRepair: ({ projectState, prompt, runtimeError, options }) =>
      generationApiService.modifyProjectStreaming(projectState, prompt, runtimeError, options),
    onAttemptStart: (attempt) => {
      isAutoRepairingRef.current = true;
      setIsAutoRepairing(true);
      setAutoRepairAttempt(attempt);
      setLoadingPhase('modifying');
    },
    onAttemptFinish: () => {
      isAutoRepairingRef.current = false;
      setIsAutoRepairing(false);
      setLoadingPhase('idle');
    },
  }), [errorAggregator, generationApiService]);

  useEffect(() => {
    return () => {
      generationApiService.dispose();
    };
  }, [generationApiService]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const abortCurrentRequest = useCallback(() => {
    generationApiService.abortCurrentRequest();
  }, [generationApiService]);

  const resetAutoRepair = useCallback(() => {
    repairService.reset();
    isAutoRepairingRef.current = false;
    setAutoRepairAttempt(0);
    setIsAutoRepairing(false);
  }, [repairService]);

  const generateProjectStreaming = useCallback(async (description: string, attachments?: ImageAttachment[]): Promise<GenerateProjectResponse> => {
    return generationApiService.generateProjectStreaming(description, attachments);
  }, [generationApiService]);

  const generateProject = useCallback(async (description: string, attachments?: ImageAttachment[]): Promise<GenerateProjectResponse> => {
    return generationApiService.generateProject(description, attachments);
  }, [generationApiService]);

  const modifyProject = useCallback(async (
    currentState: SerializedProjectState,
    prompt: string,
    runtimeError?: RuntimeError,
    options?: Parameters<GenerationActionsValue['modifyProject']>[3]
  ): Promise<ModifyProjectResponse> => {
    return generationApiService.modifyProject(currentState, prompt, runtimeError, options);
  }, [generationApiService]);

  const modifyProjectStreaming = useCallback(async (
    currentState: SerializedProjectState,
    prompt: string,
    runtimeError?: RuntimeError,
    options?: Parameters<GenerationActionsValue['modifyProjectStreaming']>[3]
  ): Promise<ModifyProjectResponse> => {
    return generationApiService.modifyProjectStreaming(currentState, prompt, runtimeError, options);
  }, [generationApiService]);

  const autoRepair = useCallback(async (
    runtimeError: RuntimeError,
    projectState: SerializedProjectState | null,
    aggregatedErrors?: AggregatedErrors | null
  ): Promise<boolean> => {
    if (isAutoRepairingRef.current) {
      return false;
    }

    const result = await repairService.runRepair({
      runtimeError,
      projectState,
      aggregatedErrors,
    });

    if (result.executed && result.partialSuccess) {
      genLogger.warn('Partial repair success', {
        rolledBackFiles: result.rolledBackFiles,
      });
    }

    if (result.executed && !result.success && result.error) {
      genLogger.error('Repair failed', { error: result.error });
    }

    return result.success;
  }, [repairService]);

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

  return (
    <GenerationStateContext.Provider value={stateValue}>
      <GenerationActionsContext.Provider value={actionsValue}>
        {children}
      </GenerationActionsContext.Provider>
    </GenerationStateContext.Provider>
  );
}
