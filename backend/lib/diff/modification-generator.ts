import type { ProjectState, ConversationTurn } from '@ai-app-builder/shared';
import type { AIProvider, AIResponse } from '../ai';
import type { CodeSlice } from '../analysis/file-planner/types';
import { getModificationPrompt, MODIFICATION_OUTPUT_SCHEMA } from './prompts/modification-prompt';
import { getMaxOutputTokens } from '../config';
import { ModificationOutputSchema } from '../core/schemas';
import { isSafePath } from '../utils';
import { buildModificationPrompt, buildFailedEditRetryPrompt, buildReplaceFileRetryPrompt } from './prompt-builder';
import { applyFileEdits } from './file-edit-applicator';
import type { FailedFileEdit } from './file-edit-applicator';
import { createLogger } from '../logger';
import { OperationTimer, formatMetrics } from '../metrics';

const logger = createLogger('ModificationGenerator');

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export async function generateModifications(
  prompt: string,
  slices: CodeSlice[],
  projectState: ProjectState,
  shouldIncludeDesignSystem: boolean,
  aiProvider: AIProvider,
  requestId?: string,
  conversationHistory?: ConversationTurn[]
): Promise<{
  success: boolean;
  error?: string;
  updatedFiles?: Record<string, string | null>;
  deletedFiles?: string[];
}> {
  const contextPrompt = buildModificationPrompt(prompt, slices, projectState, conversationHistory);

  const MAX_ATTEMPTS = 4;
  const editErrors: string[] = [];
  const startTime = Date.now();

  // Accumulated results across retries — successful file updates are kept
  let accumulatedUpdates: Record<string, string | null> = {};
  let accumulatedDeleted: string[] = [];
  let currentFailedFileEdits: FailedFileEdit[] = [];

  // --- Attempt 1: Full generation (same as before) ---
  {
    const attempt = 1;
    await attemptDelay(attempt);
    const attemptTimer = new OperationTimer(`modification-attempt-${attempt}`, requestId);
    logger.info('Modification attempt', { attempt, maxAttempts: MAX_ATTEMPTS, strategy: 'full' });

    const response = await callModificationAI(prompt, contextPrompt, shouldIncludeDesignSystem, attempt, null, aiProvider, requestId);

    if (!response.success || !response.content) {
      const error = response.error ?? 'Failed to get modification from AI';
      editErrors.push(error);
      logger.info('Modification attempt metrics', formatMetrics(attemptTimer.complete(false, { retryCount: 0, error })));
    } else {
      const result = await processAIResponse(response.content, projectState);
      logger.info('Modification attempt metrics', formatMetrics(attemptTimer.complete(result.success, { retryCount: 0, error: result.error })));

      if (result.success) {
        logSuccess(1, editErrors, startTime);
        return { success: true, updatedFiles: result.updatedFiles, deletedFiles: result.deletedFiles };
      }

      // Merge successful files, track failures
      if (result.updatedFiles) {
        accumulatedUpdates = { ...accumulatedUpdates, ...result.updatedFiles };
      }
      if (result.deletedFiles) {
        accumulatedDeleted = [...accumulatedDeleted, ...result.deletedFiles];
      }
      if (result.failedFileEdits && result.failedFileEdits.length > 0) {
        currentFailedFileEdits = result.failedFileEdits;
      }
      editErrors.push(result.error ?? 'Edit application failed');
    }
  }

  // --- Attempt 2: Focused search/replace retry (failed files only) ---
  if (currentFailedFileEdits.length > 0) {
    const attempt = 2;
    await attemptDelay(attempt);
    const attemptTimer = new OperationTimer(`modification-attempt-${attempt}`, requestId);
    logger.info('Modification attempt', { attempt, maxAttempts: MAX_ATTEMPTS, strategy: 'focused-retry', failedFiles: currentFailedFileEdits.map(f => f.path) });

    const retryPrompt = buildFailedEditRetryPrompt(prompt, currentFailedFileEdits);
    const response = await callModificationAI(prompt, retryPrompt, shouldIncludeDesignSystem, attempt, editErrors[editErrors.length - 1], aiProvider, requestId);

    if (response.success && response.content) {
      const result = await processAIResponse(response.content, buildProjectStateWithPartials(projectState, currentFailedFileEdits));
      logger.info('Modification attempt metrics', formatMetrics(attemptTimer.complete(result.success, { retryCount: 1, error: result.error })));

      if (result.success && result.updatedFiles) {
        // Merge retry results into accumulated
        accumulatedUpdates = { ...accumulatedUpdates, ...result.updatedFiles };
        currentFailedFileEdits = [];
        logSuccess(2, editErrors, startTime);
        return { success: true, updatedFiles: accumulatedUpdates, deletedFiles: [...accumulatedDeleted, ...(result.deletedFiles ?? [])] };
      }

      // Update failures for next attempt
      if (result.failedFileEdits && result.failedFileEdits.length > 0) {
        currentFailedFileEdits = result.failedFileEdits;
      }
      if (result.updatedFiles) {
        accumulatedUpdates = { ...accumulatedUpdates, ...result.updatedFiles };
      }
      editErrors.push(result.error ?? 'Focused retry failed');
    } else {
      editErrors.push(response.error ?? 'AI provider error on focused retry');
      logger.info('Modification attempt metrics', formatMetrics(attemptTimer.complete(false, { retryCount: 1, error: editErrors[editErrors.length - 1] })));
    }
  }

  // --- Attempts 3-4: Force replace_file for remaining failures ---
  for (let attempt = 3; attempt <= MAX_ATTEMPTS; attempt++) {
    if (currentFailedFileEdits.length === 0) break;

    await attemptDelay(attempt);
    const attemptTimer = new OperationTimer(`modification-attempt-${attempt}`, requestId);
    logger.info('Modification attempt', { attempt, maxAttempts: MAX_ATTEMPTS, strategy: 'replace_file', failedFiles: currentFailedFileEdits.map(f => f.path) });

    const retryPrompt = buildReplaceFileRetryPrompt(prompt, currentFailedFileEdits);
    const response = await callModificationAI(prompt, retryPrompt, shouldIncludeDesignSystem, attempt, editErrors[editErrors.length - 1], aiProvider, requestId);

    if (response.success && response.content) {
      const result = await processAIResponse(response.content, buildProjectStateWithPartials(projectState, currentFailedFileEdits));
      logger.info('Modification attempt metrics', formatMetrics(attemptTimer.complete(result.success, { retryCount: attempt - 1, error: result.error })));

      if (result.updatedFiles) {
        accumulatedUpdates = { ...accumulatedUpdates, ...result.updatedFiles };
      }
      if (result.success) {
        currentFailedFileEdits = [];
        logSuccess(attempt, editErrors, startTime);
        return { success: true, updatedFiles: accumulatedUpdates, deletedFiles: [...accumulatedDeleted, ...(result.deletedFiles ?? [])] };
      }
      if (result.failedFileEdits && result.failedFileEdits.length > 0) {
        currentFailedFileEdits = result.failedFileEdits;
      }
      editErrors.push(result.error ?? 'replace_file retry failed');
    } else {
      editErrors.push(response.error ?? 'AI provider error on replace_file retry');
      logger.info('Modification attempt metrics', formatMetrics(attemptTimer.complete(false, { retryCount: attempt - 1, error: editErrors[editErrors.length - 1] })));
    }
  }

  // --- After max retries: accept partial results ---
  if (Object.keys(accumulatedUpdates).length > 0) {
    logger.warn('Accepting partial results after max retries', {
      totalAttempts: MAX_ATTEMPTS,
      successfulFiles: Object.keys(accumulatedUpdates).length,
      remainingFailures: currentFailedFileEdits.map(f => f.path),
      totalDurationMs: Date.now() - startTime,
    });
    return { success: true, updatedFiles: accumulatedUpdates, deletedFiles: accumulatedDeleted };
  }

  logger.info('generateModifications summary', {
    totalAttempts: MAX_ATTEMPTS,
    successAttempt: null,
    editErrors,
    totalDurationMs: Date.now() - startTime,
  });
  return {
    success: false,
    error: `Failed after ${MAX_ATTEMPTS} attempts. Last error: ${editErrors[editErrors.length - 1]}`,
  };
}

function attemptDelay(attempt: number): Promise<void> {
  if (attempt <= 1) return Promise.resolve();
  return delay(attempt * 500);
}

function logSuccess(attempt: number, editErrors: string[], startTime: number): void {
  logger.info('Modification succeeded', { attempt });
  logger.info('generateModifications summary', {
    totalAttempts: attempt,
    successAttempt: attempt,
    editErrors,
    totalDurationMs: Date.now() - startTime,
  });
}

/**
 * Build a ProjectState with partial content from failed files merged in,
 * so retry attempts see the current state of the files.
 */
function buildProjectStateWithPartials(
  projectState: ProjectState,
  failedFileEdits: FailedFileEdit[],
): ProjectState {
  const files = { ...projectState.files };
  for (const failed of failedFileEdits) {
    if (failed.partialContent) {
      files[failed.path] = failed.partialContent;
    }
  }
  return { ...projectState, files };
}

async function processAIResponse(
  content: string,
  projectState: ProjectState,
): Promise<{
  success: boolean;
  error?: string;
  updatedFiles?: Record<string, string | null>;
  deletedFiles?: string[];
  failedFileEdits?: FailedFileEdit[];
}> {
  const parseResult = parseModificationResponse(content);
  if (!parseResult.success) {
    return { success: false, error: parseResult.error };
  }

  const aiFilesArray = parseResult.files!;
  const pathError = validateFilePaths(aiFilesArray);
  if (pathError) {
    return { success: false, error: pathError };
  }

  const editResult = await applyFileEdits(aiFilesArray, projectState);
  return {
    success: editResult.success,
    error: editResult.error,
    updatedFiles: editResult.updatedFiles,
    deletedFiles: editResult.deletedFiles,
    failedFileEdits: editResult.failedFileEdits,
  };
}

async function callModificationAI(
  userRequest: string,
  contextPrompt: string,
  shouldIncludeDesignSystem: boolean,
  attempt: number,
  lastEditError: string | null,
  aiProvider: AIProvider,
  requestId?: string
): Promise<AIResponse> {
  const systemInstruction = getModificationPrompt(userRequest, shouldIncludeDesignSystem);

  logger.info('Sending modification request to AI provider', {
    attempt,
    promptLength: contextPrompt.length,
    systemInstructionLength: systemInstruction.length,
    temperature: 0.7,
    isRetry: !!lastEditError,
    shouldIncludeDesignSystem,
  });
  logger.debug('AI provider modification request details', {
    prompt: contextPrompt,
    systemInstruction,
    responseSchema: MODIFICATION_OUTPUT_SCHEMA,
  });

  const response = await aiProvider.generate({
    prompt: contextPrompt,
    systemInstruction,
    temperature: 0.7,
    maxOutputTokens: getMaxOutputTokens('modification'),
    responseSchema: MODIFICATION_OUTPUT_SCHEMA,
    requestId,
  });

  logger.info('Received modification response from AI provider', {
    success: response.success,
    contentLength: response.content?.length ?? 0,
    hasError: !!response.error,
  });
  logger.debug('AI provider modification response content', {
    content: response.content,
    error: response.error,
  });

  return response;
}

function parseModificationResponse(content: string): {
  success: boolean;
  files?: Array<{ path: string; operation: string; content?: string; edits?: Array<{ search: string; replace: string }> }>;
  error?: string;
} {
  let parsedData: unknown;
  try {
    parsedData = JSON.parse(content);
  } catch (e) {
    const error = `Failed to parse AI response: ${e instanceof Error ? e.message : 'Invalid JSON'}`;
    logger.error('Failed to parse AI output as JSON', { error });
    return { success: false, error };
  }

  const zodResult = ModificationOutputSchema.safeParse(parsedData);
  if (!zodResult.success) {
    const error = `Schema validation failed: ${zodResult.error.message}`;
    logger.error('Zod validation failed on modification response', { errors: zodResult.error.issues });
    return { success: false, error };
  }

  const aiFilesArray = zodResult.data.files;
  if (!aiFilesArray || !Array.isArray(aiFilesArray)) {
    logger.error('AI response missing files array');
    return { success: false, error: 'AI response missing files array' };
  }

  logger.debug('Processing file edits', { fileCount: aiFilesArray.length });
  return { success: true, files: aiFilesArray };
}

function validateFilePaths(aiFilesArray: Array<{ path: string }>): string | null {
  for (const fileEdit of aiFilesArray) {
    if (fileEdit.path && !isSafePath(fileEdit.path)) {
      logger.error('Unsafe file path detected', { path: fileEdit.path });
      return `Unsafe file path detected: ${fileEdit.path}`;
    }
  }
  return null;
}
