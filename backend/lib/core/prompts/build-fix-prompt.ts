/**
 * Shared helper for constructing lean, consistent build-fix prompts.
 *
 * This utility focuses the prompt on:
 * - The concrete build errors that need to be fixed
 * - The original user request/description
 * - Previous failed attempts (if any) to avoid repeating mistakes
 * - A single, concise instruction to return the complete fixed project
 *
 * It intentionally does NOT include any model-specific system instructions.
 * Callers are responsible for wrapping this user prompt with the appropriate
 * system prompt (generation vs modification) to avoid cross-module coupling.
 */

import type { RepairAttempt } from '@ai-app-builder/shared';

export type BuildFixMode = 'generation' | 'modification';

export interface BuildFixPromptOptions {
  /**
   * Context in which the build fix is being requested.
   * - "generation": fixing build errors after initial project generation
   * - "modification": fixing build errors introduced by a modification request
   */
  mode: BuildFixMode;
  /**
   * Human-readable, formatted build errors produced by BuildValidator.
   */
  errorContext: string;
  /**
   * The original user description/request that led to this build.
   * For generation flows this is the project description, and for
   * modification flows this is the modification prompt.
   */
  originalPrompt: string;
  /**
   * History of previous failed repair attempts (optional).
   * When provided, the prompt will include a section showing what was tried before.
   */
  failureHistory?: RepairAttempt[];
}

/**
 * Builds a concise, shared user prompt for build-fix retries.
 *
 * The returned string is intended to be passed as user input to the
 * appropriate system prompt builder (generation or modification),
 * e.g. getGenerationPrompt(buildFixPrompt(...)) or
 * getModificationPrompt(buildFixPrompt(...)).
 */
export function buildFixPrompt(options: BuildFixPromptOptions): string {
  const { mode, errorContext, originalPrompt, failureHistory } = options;

  const trimmedErrors = errorContext.trim();
  const label =
    mode === 'generation' ? 'Original description' : 'Original request';

  const lines = [
    'Fix the following build errors in the project:',
    '',
    trimmedErrors,
    '',
  ];

  // Add failure history section if previous attempts exist
  if (failureHistory && failureHistory.length > 0) {
    lines.push('=== PREVIOUS REPAIR ATTEMPTS ===');
    lines.push('');
    lines.push('The following fixes were already tried and FAILED. Do NOT repeat these approaches:');
    lines.push('');

    for (const attempt of failureHistory) {
      lines.push(`Attempt ${attempt.attempt}:`);
      lines.push(`  Error: ${attempt.error}`);
      if (attempt.strategy) {
        lines.push(`  What was tried: ${attempt.strategy}`);
      }
      lines.push('');
    }

    lines.push('You MUST try a DIFFERENT approach than the previous attempts.');
    lines.push('');
  }

  lines.push(`${label}: ${originalPrompt}`);
  lines.push('');
  lines.push('Return the COMPLETE fixed project with all files.');

  return lines.join('\n');
}


