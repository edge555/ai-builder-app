/**
 * Shared helper for constructing lean, consistent build-fix prompts.
 *
 * This utility focuses the prompt on:
 * - The concrete build errors that need to be fixed
 * - The original user request/description
 * - A single, concise instruction to return the complete fixed project
 *
 * It intentionally does NOT include any model-specific system instructions.
 * Callers are responsible for wrapping this user prompt with the appropriate
 * system prompt (generation vs modification) to avoid cross-module coupling.
 */

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
  const { mode, errorContext, originalPrompt } = options;

  const trimmedErrors = errorContext.trim();
  const label =
    mode === 'generation' ? 'Original description' : 'Original request';

  return [
    'Fix the following build errors in the project:',
    '',
    trimmedErrors,
    '',
    `${label}: ${originalPrompt}`,
    '',
    'Return the COMPLETE fixed project with all files.',
  ].join('\n');
}

