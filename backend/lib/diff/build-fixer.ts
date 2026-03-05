import type { ProjectState, RepairAttempt } from '@ai-app-builder/shared';
import type { AIProvider } from '../ai';
import type { BuildValidator, BuildValidationResult } from '../core/build-validator';
import type { OnProgressCallback } from './modification-engine';
import { getModificationPrompt, MODIFICATION_OUTPUT_SCHEMA } from './prompts/modification-prompt';
import { getMaxOutputTokens } from '../config';
import { ModificationOutputSchema } from '../core/schemas';
import { buildFixPrompt } from '../core/prompts/build-fix-prompt';
import { buildBuildFixPrompt } from './prompt-builder';
import { applyEdits } from './edit-applicator';
import { createLogger } from '../logger';

const logger = createLogger('BuildFixer');

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export function buildProjectView(
  projectState: ProjectState,
  updatedFiles: Record<string, string | null>
): Record<string, string> {
  const tempFiles = { ...projectState.files };
  for (const [path, content] of Object.entries(updatedFiles)) {
    if (content === null) {
      delete tempFiles[path];
    } else {
      tempFiles[path] = content;
    }
  }
  return tempFiles;
}

export async function validateAndFixBuild(
  projectState: ProjectState,
  updatedFiles: Record<string, string | null>,
  prompt: string,
  shouldIncludeDesignSystem: boolean,
  aiProvider: AIProvider,
  buildValidator: BuildValidator,
  maxBuildRetries: number,
  requestId?: string,
  onProgress?: OnProgressCallback
): Promise<{ updatedFiles: Record<string, string | null> }> {
  const tempFiles = buildProjectView(projectState, updatedFiles);
  const buildStartTime = Date.now();

  let buildResult = buildValidator.validate(tempFiles);
  let buildRetryCount = 0;
  const buildFailureHistory: RepairAttempt[] = [];
  const mutableUpdatedFiles = { ...updatedFiles };

  while (!buildResult.valid && buildRetryCount < maxBuildRetries) {
    const fixableErrors = buildResult.errors.filter(e => e.severity === 'fixable');
    const unfixableErrors = buildResult.errors.filter(e => e.severity === 'unfixable');

    if (unfixableErrors.length > 0 && fixableErrors.length === 0) {
      logger.warn('All build errors are unfixable, skipping retry loop', {
        unfixableErrors: unfixableErrors.map(e => ({ message: e.message, file: e.file })),
      });
      break;
    }

    if (unfixableErrors.length > 0) {
      logger.warn('Some build errors are unfixable and will persist after retries', {
        unfixableErrors: unfixableErrors.map(e => ({ message: e.message, file: e.file })),
      });
    }

    buildRetryCount++;
    await delay(buildRetryCount * 1000);
    onProgress?.('build-fixing', `Fixing build errors (attempt ${buildRetryCount}/${maxBuildRetries})...`);
    logger.info('Modification build retry', {
      attempt: buildRetryCount,
      maxRetries: maxBuildRetries,
      errors: buildResult.errors.map(e => e.message),
      hasFailureHistory: buildFailureHistory.length > 0,
    });

    const fixResult = await attemptBuildFix(
      buildResult, buildRetryCount, buildFailureHistory,
      prompt, shouldIncludeDesignSystem,
      mutableUpdatedFiles, tempFiles,
      aiProvider, buildValidator, requestId
    );

    if (fixResult.shouldBreak) break;
    buildResult = fixResult.buildResult ?? buildResult;
  }

  const buildFixed = buildResult.valid;
  const unfixableErrors = buildResult.errors.filter(e => e.severity === 'unfixable');

  if (!buildFixed) {
    logger.warn('Build warnings after retries', {
      errors: buildResult.errors.map(e => ({ message: e.message, file: e.file })),
    });
  }

  logger.info('validateAndFixBuild summary', {
    buildRetries: buildRetryCount,
    buildFixed,
    unfixableErrors: unfixableErrors.map(e => ({ message: e.message, file: e.file })),
    totalDurationMs: Date.now() - buildStartTime,
  });

  return { updatedFiles: mutableUpdatedFiles };
}

async function attemptBuildFix(
  buildResult: BuildValidationResult,
  buildRetryCount: number,
  buildFailureHistory: RepairAttempt[],
  prompt: string,
  shouldIncludeDesignSystem: boolean,
  mutableUpdatedFiles: Record<string, string | null>,
  tempFiles: Record<string, string>,
  aiProvider: AIProvider,
  buildValidator: BuildValidator,
  requestId?: string
): Promise<{ shouldBreak: boolean; buildResult?: BuildValidationResult }> {
  const errorContext = buildValidator.formatErrorsForAI(buildResult.errors);
  const fixUserRequest = buildFixPrompt({
    mode: 'modification',
    errorContext,
    originalPrompt: prompt,
    failureHistory: buildFailureHistory.length > 0 ? buildFailureHistory : undefined,
  });
  const fixSystemInstruction = getModificationPrompt(fixUserRequest, shouldIncludeDesignSystem) + '\n\nIMPORTANT: Fix ALL build errors. Adding missing dependencies to package.json is usually the solution.';

  const errorFiles = new Set(buildResult.errors.map(e => e.file));
  const fixContextPrompt = buildBuildFixPrompt(fixUserRequest, errorFiles, tempFiles);

  const fixResponse = await aiProvider.generate({
    prompt: fixContextPrompt,
    systemInstruction: fixSystemInstruction,
    temperature: 0.5,
    maxOutputTokens: getMaxOutputTokens('modification'),
    responseSchema: MODIFICATION_OUTPUT_SCHEMA,
    requestId,
  });

  if (!fixResponse.success || !fixResponse.content) {
    logger.error('Failed to get fix response from AI');
    buildFailureHistory.push({
      attempt: buildRetryCount,
      error: fixResponse.error || 'AI failed to generate fix',
      timestamp: new Date().toISOString(),
    });
    return { shouldBreak: true };
  }

  return parseBuildFixAndApply(
    fixResponse.content, buildRetryCount, buildFailureHistory,
    buildResult, mutableUpdatedFiles, tempFiles, buildValidator
  );
}

function parseBuildFixAndApply(
  content: string,
  buildRetryCount: number,
  buildFailureHistory: RepairAttempt[],
  buildResult: BuildValidationResult,
  mutableUpdatedFiles: Record<string, string | null>,
  tempFiles: Record<string, string>,
  buildValidator: BuildValidator
): { shouldBreak: boolean; buildResult?: BuildValidationResult } {
  try {
    let parsedFixData: unknown;
    try {
      parsedFixData = JSON.parse(content);
    } catch (parseError) {
      logger.error('Failed to parse fix response JSON', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
      });
      buildFailureHistory.push({
        attempt: buildRetryCount,
        error: parseError instanceof Error ? parseError.message : 'JSON parse error',
        strategy: 'Attempted to fix build errors but returned invalid JSON',
        timestamp: new Date().toISOString(),
      });
      return { shouldBreak: false };
    }

    const fixZodResult = ModificationOutputSchema.safeParse(parsedFixData);
    if (!fixZodResult.success) {
      logger.error('Fix response failed Zod validation', { errors: fixZodResult.error.issues });
      buildFailureHistory.push({
        attempt: buildRetryCount,
        error: `Schema validation failed: ${fixZodResult.error.message}`,
        strategy: 'Attempted to fix build errors but returned invalid schema',
        timestamp: new Date().toISOString(),
      });
      return { shouldBreak: false };
    }

    const fixOutput = fixZodResult.data;
    if (!fixOutput.files || !Array.isArray(fixOutput.files)) {
      buildFailureHistory.push({
        attempt: buildRetryCount,
        error: 'Fix response missing files array',
        timestamp: new Date().toISOString(),
      });
      return { shouldBreak: false };
    }

    for (const fileEdit of fixOutput.files) {
      applyBuildFix(fileEdit, mutableUpdatedFiles, tempFiles);
    }

    const previousErrors = buildResult.errors.map(e => e.message).join('; ');
    const newBuildResult = buildValidator.validate(tempFiles);
    if (newBuildResult.valid) {
      logger.info('Modification build errors fixed successfully');
    } else {
      buildFailureHistory.push({
        attempt: buildRetryCount,
        error: newBuildResult.errors.map(e => e.message).join('; '),
        strategy: `Tried to fix: ${previousErrors}`,
        timestamp: new Date().toISOString(),
      });
    }

    return { shouldBreak: false, buildResult: newBuildResult };
  } catch (e) {
    logger.error('Error applying fixes', { error: e instanceof Error ? e.message : 'Unknown error' });
    buildFailureHistory.push({
      attempt: buildRetryCount,
      error: e instanceof Error ? e.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
    return { shouldBreak: false };
  }
}

function applyBuildFix(
  fileEdit: { path: string; operation: string; content?: string; edits?: Array<{ search: string; replace: string }> },
  mutableUpdatedFiles: Record<string, string | null>,
  tempFiles: Record<string, string>
): void {
  if (fileEdit.operation === 'modify' && fileEdit.edits) {
    const currentContent = tempFiles[fileEdit.path];
    if (!currentContent) return;
    const editResult = applyEdits(currentContent, fileEdit.edits);
    if (editResult.success) {
      mutableUpdatedFiles[fileEdit.path] = editResult.content!;
      tempFiles[fileEdit.path] = editResult.content!;
    }
  } else if ((fileEdit.operation === 'create' || fileEdit.operation === 'replace_file') && fileEdit.content) {
    mutableUpdatedFiles[fileEdit.path] = fileEdit.content;
    tempFiles[fileEdit.path] = fileEdit.content;
  }
}
