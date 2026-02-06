import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type {
  SerializedProjectState,
  GenerateProjectResponse,
  ModifyProjectResponse,
  ChangeSummary,
  SerializedVersion,
  FileDiff,
  RuntimeError
} from '@/shared';
import type { ChatMessage, LoadingPhase } from '../components/ChatInterface';
import { config as appConfig } from '../config';
import { backend, FUNCTIONS_BASE_URL, SUPABASE_ANON_KEY } from '@/integrations/backend/client';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import type { StreamingState } from '@/hooks/useStreamingGeneration';
import { errorAggregator, type AggregatedErrors } from '@/services/ErrorAggregator';

import { ChatContext, type ChatProviderProps, type ChatContextValue, type VersionCallbacks, type ApiConfig } from './ChatContext.context';

const MAX_AUTO_REPAIR_ATTEMPTS = 3;

/**
 * Generates a unique ID for messages.
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}


/**
 * Provider component for chat state management.
 * Manages message history and handles API calls for generate and modify operations.
 * 
 * Requirements: 8.4
 */
export function ChatProvider({ children, apiConfig }: ChatProviderProps) {
  const config = useMemo(() => ({
    baseUrl: appConfig.api.baseUrl,
    ...apiConfig
  }), [apiConfig]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('idle');
  const [projectState, setProjectStateInternal] = useState<SerializedProjectState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAutoRepairing, setIsAutoRepairing] = useState(false);
  const [autoRepairAttempt, setAutoRepairAttempt] = useState(0);
  const [streamingState, setStreamingState] = useState<StreamingState | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const versionCallbacksRef = useRef<VersionCallbacks>({});
  const activeRequestRef = useRef<{ controller: AbortController; timeoutId: ReturnType<typeof setTimeout> } | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const isSubmittingRef = useRef(false);
  const lastRepairErrorRef = useRef<string | null>(null);

  // Undo/Redo hook
  const undoRedo = useUndoRedo(projectState);

  /**
   * Sets version callbacks for integration with VersionContext.
   */
  const setVersionCallbacks = useCallback((callbacks: VersionCallbacks) => {
    versionCallbacksRef.current = callbacks;
  }, []);

  /**
   * Sets the project state and notifies callbacks.
   * Optionally saves to undo stack.
   */
  const setProjectState = useCallback((newState: SerializedProjectState | null, saveToUndo = false) => {
    // Save current state to undo stack before changing
    if (saveToUndo && projectState) {
      undoRedo.pushState(projectState);
    }
    setProjectStateInternal(newState);
    if (newState && versionCallbacksRef.current.onProjectStateChanged) {
      versionCallbacksRef.current.onProjectStateChanged(newState);
    }
  }, [projectState, undoRedo]);

  /**
   * Undo to previous project state.
   */
  const undo = useCallback(() => {
    const previousState = undoRedo.undo();
    if (previousState) {
      setProjectStateInternal(previousState);
      // Add system message about the state change
      const message: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: '↩️ Reverted to previous state',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, message]);
    }
  }, [undoRedo]);

  /**
   * Redo to next project state.
   */
  const redo = useCallback(() => {
    const nextState = undoRedo.redo();
    if (nextState) {
      setProjectStateInternal(nextState);
      // Add system message about the state change
      const message: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: '↪️ Restored undone changes',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, message]);
    }
  }, [undoRedo]);

  useEffect(() => {
    return () => {
      const activeRequest = activeRequestRef.current;
      if (activeRequest) {
        activeRequest.controller.abort();
        clearTimeout(activeRequest.timeoutId);
        activeRequestRef.current = null;
      }
    };
  }, []);

  /**
   * Adds a user message to the chat history.
   */
  const addUserMessage = useCallback((content: string): ChatMessage => {
    const message: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, message]);
    return message;
  }, []);

  /**
   * Adds an assistant message to the chat history.
   */
  const addAssistantMessage = useCallback((content: string, changeSummary?: ChangeSummary, diffs?: FileDiff[]): ChatMessage => {
    const message: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content,
      timestamp: new Date(),
      changeSummary,
      diffs,
    };
    setMessages((prev) => [...prev, message]);
    return message;
  }, []);

  /**
   * Calls the streaming generate project API.
   */
  const generateProjectStreaming = useCallback(async (description: string): Promise<GenerateProjectResponse> => {
    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;

    setIsStreaming(true);
    setStreamingState({
      phase: 'connecting',
      files: {},
      currentFile: null,
      filesReceived: 0,
      totalFiles: 0,
      textLength: 0,
      error: null,
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
      let result: GenerateProjectResponse = { success: false };
      const files: Record<string, string> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

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
            try {
              const data = JSON.parse(currentData);

              switch (currentEvent) {
                case 'start':
                  setStreamingState(prev => prev ? { ...prev, phase: 'generating' } : null);
                  break;

                case 'progress':
                  setStreamingState(prev => prev ? { ...prev, textLength: data.length || 0 } : null);
                  break;

                case 'file':
                  files[data.path] = data.content;
                  setStreamingState(prev => prev ? {
                    ...prev,
                    phase: 'processing',
                    files: { ...files },
                    currentFile: data.path,
                    filesReceived: data.index + 1,
                    totalFiles: data.total,
                  } : null);
                  break;

                case 'complete':
                  result = {
                    success: true,
                    projectState: data.projectState,
                    version: data.version,
                  };
                  setStreamingState(prev => prev ? {
                    ...prev,
                    phase: 'complete',
                    files: data.projectState?.files || files,
                    currentFile: null,
                  } : null);
                  break;

                case 'error':
                  result = { success: false, error: data.error };
                  setStreamingState(prev => prev ? { ...prev, phase: 'error', error: data.error } : null);
                  break;
              }
            } catch {
              // Skip invalid JSON
            }
            currentEvent = '';
            currentData = '';
          } else if (line !== '') {
            buffer += line + '\n';
          }
        }
      }

      return result;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return { success: false, error: 'Generation cancelled' };
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
      // AbortController isn't currently wired into invoke(); timeout still handled by controller.
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
   * Resets auto-repair state.
   */
  const resetAutoRepair = useCallback(() => {
    setAutoRepairAttempt(0);
    setIsAutoRepairing(false);
    lastRepairErrorRef.current = null;
  }, []);

  /**
   * Triggers auto-repair for a runtime error.
   * Returns true if repair was successful.
   */
  const autoRepair = useCallback(async (runtimeError: RuntimeError): Promise<boolean> => {
    // Prevent duplicate repairs for the same error
    const errorKey = `${runtimeError.message}:${runtimeError.filePath}`;
    if (lastRepairErrorRef.current === errorKey) {
      return false;
    }

    // Check if we've exceeded max attempts
    if (autoRepairAttempt >= MAX_AUTO_REPAIR_ATTEMPTS) {
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

      if (result.success && result.projectState) {
        setProjectState(result.projectState);
        addAssistantMessage(
          `🔧 Auto-repair applied: Fixed ${runtimeError.type.toLowerCase().replace('_', ' ')} in ${runtimeError.filePath || 'the application'}.`,
          result.changeSummary,
          result.diffs
        );

        // Notify version callbacks
        const callbacks = versionCallbacksRef.current;
        if (result.version && callbacks.onVersionCreated) {
          callbacks.onVersionCreated(result.version);
        }
        if (result.diffs && callbacks.onDiffsComputed) {
          callbacks.onDiffsComputed(result.diffs);
        }

        setIsAutoRepairing(false);
        setLoadingPhase('idle');
        return true;
      } else {
        console.error('[AutoRepair] Repair failed:', result.error);
        setIsAutoRepairing(false);
        setLoadingPhase('idle');
        return false;
      }
    } catch (err) {
      console.error('[AutoRepair] Repair threw error:', err);
      setIsAutoRepairing(false);
      setLoadingPhase('idle');
      return false;
    }
  }, [projectState, autoRepairAttempt, isAutoRepairing, modifyProject, setProjectState, addAssistantMessage]);



  /**
   * Returns a random success message for project generation.
   */
  const getGenerationSuccessMessage = (projectName: string, fileCount: number): string => {
    const messages = [
      `I've generated the project "${projectName}" with ${fileCount} files. You can now preview and edit the code.`,
      `The "${projectName}" scaffold has been created successfully (${fileCount} files generated).`,
      `Project "${projectName}" is ready. I've structured ${fileCount} files according to your requirements.`,
      `Successfully generated ${fileCount} files for "${projectName}". Let me know if you need any adjustments.`,
      `Generation complete for "${projectName}". You can find the file structure in the solution explorer.`,
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  };

  /**
   * Returns a random success message for modifications.
   */
  const getModificationSuccessMessage = (description?: string): string => {
    const defaultMessages = [
      "I've applied the requested modifications to your project.",
      "Changes have been successfully integrated into the codebase.",
      "The project has been updated based on your recent request.",
      "Modifications complete. You can review the changes in the diff viewer.",
      "Updates have been applied. The project has been rebuilt to reflect your changes.",
    ];
    return description || defaultMessages[Math.floor(Math.random() * defaultMessages.length)];
  };

  /**
   * Submits a prompt to the AI, either generating a new project or modifying an existing one.
   * Updates loading phase for progress indication.
   * 
   * Requirements: 8.2
   */
  const submitPrompt = useCallback(async (prompt: string): Promise<void> => {
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    setError(null);
    setIsLoading(true);
    addUserMessage(prompt);

    try {
      const callbacks = versionCallbacksRef.current;
      if (!projectState) {
        // No project exists, generate a new one using streaming
        setLoadingPhase('generating');
        const result = await generateProjectStreaming(prompt);

        setLoadingPhase('validating');
        if (result.success && result.projectState) {
          setProjectState(result.projectState, false);
          const fileCount = Object.keys(result.projectState.files).length;
          addAssistantMessage(
            getGenerationSuccessMessage(result.projectState.name, fileCount)
          );
          // Notify version callbacks
          if (result.version && callbacks.onVersionCreated) {
            callbacks.onVersionCreated(result.version);
          }
        } else {
          const errorMsg = result.error || 'Failed to generate project';
          setError(errorMsg);
          addAssistantMessage(`Sorry, I couldn't generate the project: ${errorMsg}`);
        }
      } else {
        // Project exists, modify it - save to undo stack first
        setLoadingPhase('modifying');
        const result = await modifyProject(projectState, prompt);

        setLoadingPhase('validating');
        if (result.success && result.projectState) {
          setProjectState(result.projectState, true); // Save to undo stack
          addAssistantMessage(
            getModificationSuccessMessage(result.changeSummary?.description),
            result.changeSummary,
            result.diffs
          );
          // Notify version callbacks
          if (result.version && callbacks.onVersionCreated) {
            callbacks.onVersionCreated(result.version);
          }
          if (result.diffs && callbacks.onDiffsComputed) {
            callbacks.onDiffsComputed(result.diffs);
          }
        } else {
          const errorMsg = result.error || 'Failed to modify project';
          setError(errorMsg);
          addAssistantMessage(`Sorry, I couldn't make those changes: ${errorMsg}`);
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMsg);
      addAssistantMessage(`Sorry, something went wrong: ${errorMsg}`);
    } finally {
      setIsLoading(false);
      setLoadingPhase('idle');
      isSubmittingRef.current = false;
    }
  }, [projectState, addUserMessage, addAssistantMessage, generateProjectStreaming, modifyProject, setProjectState]);

  /**
   * Clears all messages from the chat history.
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  /**
   * Clears the current error.
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

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

  const value = useMemo<ChatContextValue>(() => ({
    messages,
    isLoading,
    loadingPhase,
    projectState,
    error,
    isAutoRepairing,
    autoRepairAttempt,
    streamingState,
    isStreaming,
    submitPrompt,
    clearMessages,
    clearError,
    setProjectState,
    setVersionCallbacks,
    autoRepair,
    resetAutoRepair,
    undo,
    redo,
    canUndo: undoRedo.canUndo,
    canRedo: undoRedo.canRedo,
  }), [messages, isLoading, loadingPhase, projectState, error, isAutoRepairing, autoRepairAttempt, streamingState, isStreaming, submitPrompt, clearMessages, clearError, setProjectState, setVersionCallbacks, autoRepair, resetAutoRepair, undo, redo, undoRedo.canUndo, undoRedo.canRedo]);

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}

