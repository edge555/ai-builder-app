import type { ProjectState } from '@ai-app-builder/shared';
import type { AIProvider, AIResponse } from '../ai';
import type { CodeSlice } from '../analysis/file-planner/types';
import { getModificationPrompt, MODIFICATION_OUTPUT_SCHEMA } from './prompts/modification-prompt';
import { getMaxOutputTokens } from '../config';
import { ModificationOutputSchema } from '../core/schemas';
import { isSafePath } from '../utils';
import { buildModificationPrompt } from './prompt-builder';
import { applyFileEdits } from './file-edit-applicator';
import { createLogger } from '../logger';

const logger = createLogger('ModificationGenerator');

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export async function generateModifications(
  prompt: string,
  slices: CodeSlice[],
  projectState: ProjectState,
  shouldIncludeDesignSystem: boolean,
  aiProvider: AIProvider,
  requestId?: string
): Promise<{
  success: boolean;
  error?: string;
  updatedFiles?: Record<string, string | null>;
  deletedFiles?: string[];
}> {
  const contextPrompt = buildModificationPrompt(prompt, slices, projectState);

  const MAX_ATTEMPTS = 4;
  let lastEditError: string | null = null;
  const editErrors: string[] = [];
  const startTime = Date.now();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await delay(attempt * 500);
    logger.info('Modification attempt', { attempt, maxAttempts: MAX_ATTEMPTS });

    // Build prompt with error feedback if this is a retry.
    // lastEditError may contain a closest-region hint from the multi-tier matcher,
    // e.g. "Closest matching region (lines 12-18, 60% similar):\n<code>"
    // Surface this directly so the AI can correct its search string.
    const userRequest = lastEditError
      ? `${prompt}\n\n[PREVIOUS ATTEMPT FAILED]\n${lastEditError}\n\nUpdate your "search" string so it exactly matches the code shown above (including indentation and newlines). Use a smaller, more unique anchor if needed.`
      : prompt;

    const response = await callModificationAI(userRequest, contextPrompt, shouldIncludeDesignSystem, attempt, lastEditError, aiProvider, requestId);

    if (!response.success || !response.content) {
      logger.error('AI provider error', { error: response.error });
      lastEditError = response.error ?? 'Failed to get modification from AI';
      editErrors.push(lastEditError);
      continue;
    }

    const parseResult = parseModificationResponse(response.content);
    if (!parseResult.success) {
      lastEditError = parseResult.error!;
      editErrors.push(lastEditError);
      continue;
    }

    const aiFilesArray = parseResult.files!;

    const pathError = validateFilePaths(aiFilesArray);
    if (pathError) {
      lastEditError = pathError;
      editErrors.push(lastEditError);
      continue;
    }

    const editResult = await applyFileEdits(aiFilesArray, projectState);
    if (editResult.success) {
      logger.info('Modification succeeded', { attempt });
      logger.info('generateModifications summary', {
        totalAttempts: attempt,
        successAttempt: attempt,
        editErrors,
        totalDurationMs: Date.now() - startTime,
      });
      return { success: true, updatedFiles: editResult.updatedFiles, deletedFiles: editResult.deletedFiles };
    }

    lastEditError = editResult.error!;
    editErrors.push(lastEditError);
    logger.info('Retrying due to error', { error: lastEditError });
  }

  logger.info('generateModifications summary', {
    totalAttempts: MAX_ATTEMPTS,
    successAttempt: null,
    editErrors,
    totalDurationMs: Date.now() - startTime,
  });
  return {
    success: false,
    error: `Failed after ${MAX_ATTEMPTS} attempts. Last error: ${lastEditError}`,
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
